/**
 * Async Provisioning Job Service
 *
 * Bridges the existing `jobs` table/repository with provisioning operations.
 * Instead of blocking HTTP requests for minutes, callers create a job and
 * return 202 immediately. A cron-based processor picks up pending jobs.
 *
 * Supported job types:
 * - milady_provision: Provision a Milady sandbox (Neon DB + Docker container)
 *
 * Future:
 * - wallet_provision: Server wallet provisioning
 * - agent_restore: Restore from backup
 */

import { jobsRepository, type Job, type NewJob } from "@/db/repositories/jobs";
import { miladySandboxService } from "@/lib/services/milaidy-sandbox";
import { logger } from "@/lib/utils/logger";

// ---------------------------------------------------------------------------
// Job type constants
// ---------------------------------------------------------------------------

export const JOB_TYPES = {
  MILADY_PROVISION: "milady_provision",
} as const;

export type ProvisioningJobType =
  (typeof JOB_TYPES)[keyof typeof JOB_TYPES];

// ---------------------------------------------------------------------------
// Job data shapes (stored in jobs.data JSONB)
// ---------------------------------------------------------------------------

export interface MiladyProvisionJobData {
  agentId: string;
  organizationId: string;
  userId: string;
  agentName: string;
}

// ---------------------------------------------------------------------------
// Job result shapes (stored in jobs.result JSONB)
// ---------------------------------------------------------------------------

export interface MiladyProvisionJobResult {
  cloudAgentId: string;
  status: string;
  bridgeUrl?: string;
  healthUrl?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class ProvisioningJobService {
  /**
   * Enqueue a Milady sandbox provisioning job.
   * Returns the job record immediately (status=pending).
   */
  async enqueueMiladyProvision(params: {
    agentId: string;
    organizationId: string;
    userId: string;
    agentName: string;
    webhookUrl?: string;
  }): Promise<Job> {
    const jobData: MiladyProvisionJobData = {
      agentId: params.agentId,
      organizationId: params.organizationId,
      userId: params.userId,
      agentName: params.agentName,
    };

    const newJob: NewJob = {
      type: JOB_TYPES.MILADY_PROVISION,
      status: "pending",
      data: jobData as unknown as Record<string, unknown>,
      organization_id: params.organizationId,
      user_id: params.userId,
      webhook_url: params.webhookUrl,
      max_attempts: 3,
      // Estimate: Neon DB (5-15s) + Docker pull/run (10-30s) + health check (up to 60s)
      estimated_completion_at: new Date(Date.now() + 90_000),
    };

    const job = await jobsRepository.create(newJob);

    logger.info("[provisioning-jobs] Enqueued milady_provision job", {
      jobId: job.id,
      agentId: params.agentId,
      orgId: params.organizationId,
    });

    return job;
  }

  /**
   * Get a job by ID (for status polling).
   */
  async getJob(jobId: string): Promise<Job | undefined> {
    return jobsRepository.findById(jobId);
  }

  /**
   * Get jobs for an organization, optionally filtered by type.
   */
  async getJobsForOrg(
    organizationId: string,
    type?: ProvisioningJobType,
    limit = 20,
  ): Promise<Job[]> {
    return jobsRepository.findByFilters({
      organizationId,
      type,
      limit,
      orderBy: "desc",
    });
  }

  // ---------------------------------------------------------------------------
  // Processing (called by cron)
  // ---------------------------------------------------------------------------

  /**
   * Claim and process pending provisioning jobs.
   * Designed to be called by a cron route every minute.
   *
   * Uses FOR UPDATE SKIP LOCKED so multiple cron invocations won't
   * double-process the same job.
   *
   * @param batchSize - Max jobs to process per invocation.
   * @returns Summary of processing results.
   */
  async processPendingJobs(batchSize = 5): Promise<ProcessingResult> {
    const result: ProcessingResult = {
      claimed: 0,
      succeeded: 0,
      failed: 0,
      errors: [],
    };

    // Process each job type
    for (const jobType of Object.values(JOB_TYPES)) {
      await this.processJobType(jobType, batchSize, result);
    }

    // Recover stale jobs (stuck in_progress for >5 minutes)
    const recovered = await this.recoverStaleJobs();
    if (recovered > 0) {
      logger.info("[provisioning-jobs] Recovered stale jobs", { recovered });
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async processJobType(
    jobType: string,
    batchSize: number,
    result: ProcessingResult,
  ): Promise<void> {
    // Atomically claim pending jobs using FOR UPDATE SKIP LOCKED.
    // This prevents double-execution when overlapping cron runs race,
    // and respects scheduled_for so exponential backoff actually works.
    const claimedJobs = await jobsRepository.claimPendingJobs({
      type: jobType,
      limit: batchSize,
    });

    for (const job of claimedJobs) {
      result.claimed++;

      try {
        await this.executeJob(job);
        result.succeeded++;
      } catch (err) {
        result.failed++;
        const errorMsg =
          err instanceof Error ? err.message : String(err);
        result.errors.push({ jobId: job.id, error: errorMsg });

        // Increment attempt; will auto-fail if max_attempts reached
        await jobsRepository.incrementAttempt(
          job.id,
          errorMsg,
          job.max_attempts,
        );
      }
    }
  }

  private async executeJob(job: Job): Promise<void> {
    switch (job.type) {
      case JOB_TYPES.MILADY_PROVISION:
        await this.executeMiladyProvision(job);
        break;
      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }
  }

  private async executeMiladyProvision(job: Job): Promise<void> {
    const data = job.data as unknown as MiladyProvisionJobData;

    logger.info("[provisioning-jobs] Executing milady_provision", {
      jobId: job.id,
      agentId: data.agentId,
    });

    const provResult = await miladySandboxService.provision(
      data.agentId,
      data.organizationId,
    );

    if (!provResult.success) {
      // Store partial result for debugging
      await jobsRepository.update(job.id, {
        result: {
          cloudAgentId: data.agentId,
          status: provResult.sandboxRecord?.status ?? "error",
          error: provResult.error,
        } as unknown as Record<string, unknown>,
      });
      throw new Error(provResult.error);
    }

    // Mark completed with result
    const jobResult: MiladyProvisionJobResult = {
      cloudAgentId: data.agentId,
      status: provResult.sandboxRecord.status,
      bridgeUrl: provResult.bridgeUrl,
      healthUrl: provResult.healthUrl,
    };

    await jobsRepository.updateStatus(job.id, "completed", {
      result: jobResult as unknown as Record<string, unknown>,
      completed_at: new Date(),
    });

    // Fire webhook if configured
    if (job.webhook_url) {
      await this.fireWebhook(job, jobResult);
    }

    logger.info("[provisioning-jobs] milady_provision completed", {
      jobId: job.id,
      agentId: data.agentId,
      status: provResult.sandboxRecord.status,
    });
  }

  private async recoverStaleJobs(): Promise<number> {
    let totalRecovered = 0;

    // For each job type, recover stale jobs across all organizations.
    // Since recoverStaleJobs requires orgId, we query distinct orgs with in_progress jobs.
    for (const jobType of Object.values(JOB_TYPES)) {
      const inProgressJobs = await jobsRepository.findByFilters({
        type: jobType,
        status: "in_progress",
        limit: 100,
      });

      // Group by org
      const orgIds = [...new Set(inProgressJobs.map((j) => j.organization_id))];

      for (const orgId of orgIds) {
        const recovered = await jobsRepository.recoverStaleJobs({
          type: jobType,
          organizationId: orgId,
          staleThresholdMs: 5 * 60 * 1000, // 5 minutes
          maxAttempts: 3,
        });
        totalRecovered += recovered;
      }
    }

    return totalRecovered;
  }

  private async fireWebhook(
    job: Job,
    result: MiladyProvisionJobResult,
  ): Promise<void> {
    if (!job.webhook_url) return;

    try {
      const response = await fetch(job.webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "job.completed",
          jobId: job.id,
          type: job.type,
          status: "completed",
          result,
          completedAt: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(10_000),
      });

      await jobsRepository.update(job.id, {
        webhook_status: response.ok ? "delivered" : `failed_${response.status}`,
      } as Partial<Job>);

      if (!response.ok) {
        logger.warn("[provisioning-jobs] Webhook delivery failed", {
          jobId: job.id,
          webhookUrl: job.webhook_url,
          status: response.status,
        });
      }
    } catch (err) {
      logger.error("[provisioning-jobs] Webhook delivery error", {
        jobId: job.id,
        error: err instanceof Error ? err.message : String(err),
      });

      await jobsRepository.update(job.id, {
        webhook_status: "error",
      } as Partial<Job>);
    }
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProcessingResult {
  claimed: number;
  succeeded: number;
  failed: number;
  errors: Array<{ jobId: string; error: string }>;
}

// Singleton
export const provisioningJobService = new ProvisioningJobService();

import { jobsRepository } from "@/db/repositories/jobs";
import type { Job } from "@/db/schemas/jobs";
import { logger } from "@/lib/utils/logger";
import { getKnowledgeService } from "@/lib/eliza/knowledge-service";
import type { UUID } from "@elizaos/core";
import { userContextService } from "@/lib/eliza/user-context";
import { RuntimeFactory } from "@/lib/eliza/runtime-factory";
import { AgentMode } from "@/lib/eliza/agent-mode-types";
import type { UserWithOrganization, ApiKey } from "@/lib/types";
import { KNOWLEDGE_CONSTANTS } from "@/lib/constants/knowledge";

interface FileToQueue {
  blobUrl: string;
  filename: string;
  contentType: string;
  size: number;
}

interface QueueFilesParams {
  characterId: string;
  files: FileToQueue[];
  user: UserWithOrganization;
}

interface ProcessJobParams {
  user: UserWithOrganization;
  apiKey?: ApiKey;
}

interface JobStatus {
  isProcessing: boolean;
  totalFiles: number;
  processedFiles: number;
  pendingCount: number;
  processingCount: number;
  completedCount: number;
  failedCount: number;
  jobs: Array<{
    id: string;
    filename: string;
    status: string;
    error: string | null;
    createdAt: Date;
    completedAt: Date | null;
  }>;
}

const TRUSTED_BLOB_HOSTS = [
  "blob.vercel-storage.com",
  "public.blob.vercel-storage.com",
];

function isValidBlobUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    // Vercel Blob URLs have random subdomain prefixes (e.g., l5fpqchmvmrcwa0k.public.blob.vercel-storage.com)
    // Using endsWith is safe because Vercel controls all subdomains of blob.vercel-storage.com
    return TRUSTED_BLOB_HOSTS.some((host) => 
      parsedUrl.hostname === host || parsedUrl.hostname.endsWith(`.${host}`)
    );
  } catch {
    return false;
  }
}

/**
 * Service for managing knowledge file processing background jobs.
 * Handles queuing, processing, and status tracking of knowledge files.
 * Uses the generic jobs repository for database operations.
 */
export class KnowledgeProcessingService {
  private readonly JOB_TYPE = "knowledge_processing";
  private readonly MAX_ATTEMPTS = KNOWLEDGE_CONSTANTS.MAX_ATTEMPTS;
  private readonly STALE_JOB_THRESHOLD_MS = KNOWLEDGE_CONSTANTS.STALE_JOB_THRESHOLD_MS;

  /**
   * Queues multiple files for background processing.
   *
   * @param params - Parameters including characterId, files, and user.
   * @returns Array of created job IDs.
   */
  async queueFiles(params: QueueFilesParams): Promise<string[]> {
    const { characterId, files, user } = params;

    if (!user.organization_id) {
      throw new Error("User must have an organization to queue knowledge files");
    }

    const jobIds: string[] = [];

    for (const file of files) {
      const job = await jobsRepository.create({
        type: this.JOB_TYPE,
        status: "pending",
        data: {
          characterId,
          file,
        },
        organization_id: user.organization_id,
        user_id: user.id,
        max_attempts: this.MAX_ATTEMPTS,
        scheduled_for: new Date(),
      });

      jobIds.push(job.id);

      logger.info("[KnowledgeProcessing] Queued file for processing", {
        jobId: job.id,
        characterId,
        filename: file.filename,
      });
    }

    return jobIds;
  }

  /**
   * Gets processing status for a character's knowledge files.
   *
   * @param characterId - Character ID to check.
   * @param organizationId - Organization ID for security.
   * @returns Job status summary.
   */
  async getStatus(characterId: string, organizationId: string): Promise<JobStatus> {
    const jobs = await jobsRepository.findByDataField({
      type: this.JOB_TYPE,
      organizationId,
      dataField: "characterId",
      dataValue: characterId,
      orderBy: "desc",
    });

    const pending = jobs.filter((j: Job) => j.status === "pending");
    const processing = jobs.filter((j: Job) => j.status === "in_progress");
    const completed = jobs.filter((j: Job) => j.status === "completed");
    const failed = jobs.filter((j: Job) => j.status === "failed");

    const totalFiles = jobs.length;
    const processedFiles = completed.length + failed.length;
    const isProcessing = pending.length > 0 || processing.length > 0;

    return {
      isProcessing,
      totalFiles,
      processedFiles,
      pendingCount: pending.length,
      processingCount: processing.length,
      completedCount: completed.length,
      failedCount: failed.length,
      jobs: jobs.map((job: Job) => ({
        id: job.id,
        filename:
          (job.data as { file?: { filename?: string } }).file?.filename || "Unknown",
        status: job.status,
        error: job.error,
        createdAt: job.created_at,
        completedAt: job.completed_at,
      })),
    };
  }

  /**
   * Processes pending jobs from the queue.
   * Processes up to 5 jobs per invocation.
   * Uses FOR UPDATE SKIP LOCKED to prevent race conditions.
   *
   * @param params - User and API key for authentication.
   * @returns Processing results.
   */
  async processQueue(
    params: ProcessJobParams,
  ): Promise<{ successCount: number; failureCount: number; totalProcessed: number; recoveredCount: number }> {
    const { user, apiKey } = params;

    if (!user.organization_id) {
      throw new Error("User must have an organization to process knowledge files");
    }

    // First, recover any stale jobs that have been stuck in in_progress for too long
    const recoveredCount = await jobsRepository.recoverStaleJobs({
      type: this.JOB_TYPE,
      organizationId: user.organization_id,
      staleThresholdMs: this.STALE_JOB_THRESHOLD_MS,
    });

    if (recoveredCount > 0) {
      logger.info(`[KnowledgeProcessing] Recovered ${recoveredCount} stale jobs`);
    }

    // Atomically claim pending jobs using FOR UPDATE SKIP LOCKED
    // This prevents race conditions where multiple workers grab the same jobs
    const claimedJobs = await jobsRepository.claimPendingJobs({
      type: this.JOB_TYPE,
      organizationId: user.organization_id,
      limit: 5,
    });

    if (claimedJobs.length === 0) {
      return { successCount: 0, failureCount: 0, totalProcessed: 0, recoveredCount };
    }

    logger.info(`[KnowledgeProcessing] Claimed ${claimedJobs.length} jobs for processing`);

    let successCount = 0;
    let failureCount = 0;

    for (const job of claimedJobs) {
      // Job is already marked as in_progress by claimPendingJobs
      const success = await this.processJob(job, user, apiKey);
      if (success) {
        successCount++;
      } else {
        failureCount++;
      }
    }

    return { successCount, failureCount, totalProcessed: claimedJobs.length, recoveredCount };
  }

  /**
   * Processes a single job.
   *
   * @param job - Job to process.
   * @param user - User context.
   * @param apiKey - Optional API key.
   * @returns True if successful, false otherwise.
   */
  private async processJob(job: Job, user: UserWithOrganization, apiKey?: ApiKey): Promise<boolean> {
    const jobData = job.data as {
      characterId: string;
      file: {
        blobUrl: string;
        filename: string;
        contentType: string;
        size: number;
      };
    };

    // Idempotency check: verify job hasn't already been processed.
    // Check both status and result field - if result exists, knowledge was already added
    // even if status update failed afterward.
    const currentJob = await jobsRepository.findById(job.id);
    if (!currentJob) {
      logger.warn("[KnowledgeProcessing] Job not found, skipping", { jobId: job.id });
      return true;
    }
    if (currentJob.status === "completed" || currentJob.result) {
      // If result exists but status is not completed, fix the status
      // This can happen if updateStatus() failed after update() succeeded
      if (currentJob.result && currentJob.status !== "completed") {
        await jobsRepository.updateStatus(job.id, "completed");
        logger.info("[KnowledgeProcessing] Fixed job status to completed", {
          jobId: job.id,
          previousStatus: currentJob.status,
        });
      } else {
        logger.info("[KnowledgeProcessing] Job already processed, skipping", {
          jobId: job.id,
          status: currentJob.status,
          hasResult: !!currentJob.result,
        });
      }
      return true;
    }

    try {
      // Note: Job status is already set to in_progress by claimPendingJobs

      // Build user context
      const userContext = await userContextService.buildContext({
        user,
        apiKey,
        isAnonymous: false,
        agentMode: AgentMode.ASSISTANT,
      });

      userContext.characterId = jobData.characterId;

      // Create runtime
      const runtimeFactory = RuntimeFactory.getInstance();
      const runtime = await runtimeFactory.createRuntimeForUser(userContext);

      const knowledgeService = await getKnowledgeService(runtime);

      if (!knowledgeService) {
        const error = "Knowledge service not available";
        await jobsRepository.incrementAttempt(
          job.id,
          error,
          job.max_attempts || this.MAX_ATTEMPTS,
        );
        logger.error(`[KnowledgeProcessing] ${error}`, { jobId: job.id });
        return false;
      }

      // Validate blob URL against trusted domains to prevent SSRF
      if (!isValidBlobUrl(jobData.file.blobUrl)) {
        const error = "Invalid or untrusted blob URL";
        await jobsRepository.incrementAttempt(
          job.id,
          error,
          job.max_attempts || this.MAX_ATTEMPTS,
        );
        logger.error(`[KnowledgeProcessing] ${error}`, { jobId: job.id });
        return false;
      }

      // Fetch file from blob
      const response = await fetch(jobData.file.blobUrl);
      if (!response.ok) {
        const error = `Failed to fetch blob: ${response.status}`;
        await jobsRepository.incrementAttempt(
          job.id,
          error,
          job.max_attempts || this.MAX_ATTEMPTS,
        );
        logger.error(`[KnowledgeProcessing] ${error}`, { jobId: job.id });
        return false;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64Content = buffer.toString("base64");

      // Process through knowledge service
      const result = await knowledgeService.addKnowledge({
        agentId: runtime.agentId,
        clientDocumentId: "" as UUID,
        content: base64Content,
        contentType: jobData.file.contentType,
        originalFilename: jobData.file.filename,
        worldId: runtime.agentId,
        roomId: runtime.agentId,
        entityId: runtime.agentId,
        metadata: {
          uploadedBy: job.user_id,
          uploadedAt: Date.now(),
          organizationId: user.organization_id,
          fileSize: jobData.file.size,
          filename: jobData.file.filename,
          blobUrl: jobData.file.blobUrl,
          jobId: job.id,
        },
      });

      // Store result first for idempotency - this ensures that even if the status update
      // fails, we won't reprocess this job (the idempotency check looks for result field).
      const jobResult = {
        fragmentCount: result.fragmentCount,
        documentId: result.clientDocumentId,
        processedAt: Date.now(),
      };

      await jobsRepository.update(job.id, { result: jobResult });

      // Now mark as completed
      await jobsRepository.updateStatus(job.id, "completed");

      logger.info("[KnowledgeProcessing] Job completed successfully", {
        jobId: job.id,
        filename: jobData.file.filename,
        fragmentCount: result.fragmentCount,
      });

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await jobsRepository.incrementAttempt(
        job.id,
        errorMessage,
        job.max_attempts || this.MAX_ATTEMPTS,
      );
      logger.error(`[KnowledgeProcessing] Job failed`, {
        jobId: job.id,
        filename: jobData.file.filename,
        error: errorMessage,
      });
      return false;
    }
  }
}

// Singleton instance
export const knowledgeProcessingService = new KnowledgeProcessingService();

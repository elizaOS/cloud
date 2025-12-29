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
import { isValidBlobUrl, deleteBlob } from "@/lib/blob";

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

/**
 * Service for managing knowledge file processing background jobs.
 * Handles queuing, processing, and status tracking of knowledge files.
 * Uses the generic jobs repository for database operations.
 */
export class KnowledgeProcessingService {
  private readonly JOB_TYPE = "knowledge_processing";
  private readonly MAX_ATTEMPTS = KNOWLEDGE_CONSTANTS.MAX_ATTEMPTS;
  private readonly STALE_JOB_THRESHOLD_MS =
    KNOWLEDGE_CONSTANTS.STALE_JOB_THRESHOLD_MS;

  /**
   * Queues multiple files for background processing.
   *
   * @param params - Parameters including characterId, files, and user.
   * @returns Array of created job IDs.
   */
  async queueFiles(params: QueueFilesParams): Promise<string[]> {
    const { characterId, files, user } = params;

    if (!user.organization_id) {
      throw new Error(
        "User must have an organization to queue knowledge files",
      );
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
  async getStatus(
    characterId: string,
    organizationId: string,
  ): Promise<JobStatus> {
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
          (job.data as { file?: { filename?: string } }).file?.filename ||
          "Unknown",
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
  async processQueue(params: ProcessJobParams): Promise<{
    successCount: number;
    failureCount: number;
    totalProcessed: number;
    recoveredCount: number;
  }> {
    const { user, apiKey } = params;

    if (!user.organization_id) {
      throw new Error(
        "User must have an organization to process knowledge files",
      );
    }

    // First, recover any stale jobs that have been stuck in in_progress for too long
    // Increments attempts counter to prevent infinite retry loops for problematic files
    const recoveredCount = await jobsRepository.recoverStaleJobs({
      type: this.JOB_TYPE,
      organizationId: user.organization_id,
      staleThresholdMs: this.STALE_JOB_THRESHOLD_MS,
      maxAttempts: this.MAX_ATTEMPTS,
    });

    if (recoveredCount > 0) {
      logger.info(
        `[KnowledgeProcessing] Recovered ${recoveredCount} stale jobs`,
      );
    }

    // Atomically claim pending jobs using FOR UPDATE SKIP LOCKED
    // This prevents race conditions where multiple workers grab the same jobs
    const claimedJobs = await jobsRepository.claimPendingJobs({
      type: this.JOB_TYPE,
      organizationId: user.organization_id,
      limit: 5,
    });

    if (claimedJobs.length === 0) {
      return {
        successCount: 0,
        failureCount: 0,
        totalProcessed: 0,
        recoveredCount,
      };
    }

    logger.info(
      `[KnowledgeProcessing] Claimed ${claimedJobs.length} jobs for processing`,
    );

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

    return {
      successCount,
      failureCount,
      totalProcessed: claimedJobs.length,
      recoveredCount,
    };
  }

  /**
   * Processes a single job.
   *
   * @param job - Job to process.
   * @param user - User context.
   * @param apiKey - Optional API key.
   * @returns True if successful, false otherwise.
   */
  private async processJob(
    job: Job,
    user: UserWithOrganization,
    apiKey?: ApiKey,
  ): Promise<boolean> {
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
      logger.warn("[KnowledgeProcessing] Job not found, skipping", {
        jobId: job.id,
      });
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

    // Validate blob URL FIRST before any processing or cleanup attempts.
    // This prevents SSRF attacks and ensures we only attempt cleanup for trusted URLs.
    const blobUrlIsValid = isValidBlobUrl(jobData.file.blobUrl);
    if (!blobUrlIsValid) {
      const error = "Invalid or untrusted blob URL";
      await jobsRepository.incrementAttempt(
        job.id,
        error,
        job.max_attempts || this.MAX_ATTEMPTS,
      );
      // Do NOT attempt cleanup for untrusted URLs - this would be a security risk
      logger.error(`[KnowledgeProcessing] ${error}`, { jobId: job.id });
      return false;
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
        const updatedJob = await jobsRepository.incrementAttempt(
          job.id,
          error,
          job.max_attempts || this.MAX_ATTEMPTS,
        );
        if (updatedJob?.status === "failed") {
          await this.cleanupBlob(jobData.file.blobUrl, job.id);
        }
        logger.error(`[KnowledgeProcessing] ${error}`, { jobId: job.id });
        return false;
      }

      // Fetch file from blob (URL already validated above)
      const response = await fetch(jobData.file.blobUrl);
      if (!response.ok) {
        const error = `Failed to fetch blob: ${response.status}`;
        const updatedJob = await jobsRepository.incrementAttempt(
          job.id,
          error,
          job.max_attempts || this.MAX_ATTEMPTS,
        );
        if (updatedJob?.status === "failed") {
          await this.cleanupBlob(jobData.file.blobUrl, job.id);
        }
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

      // Store result and mark completed in a single update for atomicity
      // This ensures we don't end up with a job that has result but wrong status
      const jobResult = {
        fragmentCount: result.fragmentCount,
        documentId: result.clientDocumentId,
        processedAt: Date.now(),
      };

      await jobsRepository.update(job.id, {
        result: jobResult,
        status: "completed",
        completed_at: new Date(),
      });

      logger.info("[KnowledgeProcessing] Job completed successfully", {
        jobId: job.id,
        filename: jobData.file.filename,
        fragmentCount: result.fragmentCount,
      });

      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const updatedJob = await jobsRepository.incrementAttempt(
        job.id,
        errorMessage,
        job.max_attempts || this.MAX_ATTEMPTS,
      );

      // Clean up blob if job has permanently failed (max attempts reached)
      // Safe to cleanup because URL was validated before entering try block
      if (updatedJob?.status === "failed") {
        await this.cleanupBlob(jobData.file.blobUrl, job.id);
      }

      logger.error(`[KnowledgeProcessing] Job failed`, {
        jobId: job.id,
        filename: jobData.file.filename,
        error: errorMessage,
        permanentlyFailed: updatedJob?.status === "failed",
      });
      return false;
    }
  }

  /**
   * Processes a single job by ID.
   *
   * @param jobId - ID of the job to process.
   * @param user - User context.
   * @param apiKey - Optional API key.
   * @returns True if successful, false otherwise.
   */
  async processJobById(
    jobId: string,
    user: UserWithOrganization,
    apiKey?: ApiKey,
  ): Promise<boolean> {
    const job = await jobsRepository.findById(jobId);
    if (!job) {
      logger.warn("[KnowledgeProcessing] Job not found for sync processing", {
        jobId,
      });
      return false;
    }

    // Update status to in_progress
    await jobsRepository.updateStatus(jobId, "in_progress");

    return this.processJob(job, user, apiKey);
  }

  /**
   * Cleans up a blob file from storage.
   * Called when a job permanently fails to prevent storage leaks.
   *
   * @param blobUrl - URL of the blob to delete.
   * @param jobId - Job ID for logging.
   */
  private async cleanupBlob(blobUrl: string, jobId: string): Promise<void> {
    try {
      await deleteBlob(blobUrl);
      logger.info("[KnowledgeProcessing] Cleaned up blob after job failure", {
        jobId,
        blobUrl,
      });
    } catch (cleanupError) {
      // Log but don't throw - cleanup failure shouldn't affect job status
      logger.error("[KnowledgeProcessing] Failed to cleanup blob", {
        jobId,
        blobUrl,
        error:
          cleanupError instanceof Error
            ? cleanupError.message
            : "Unknown error",
      });
    }
  }
}

// Singleton instance
export const knowledgeProcessingService = new KnowledgeProcessingService();

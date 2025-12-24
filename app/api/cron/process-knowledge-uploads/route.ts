/**
 * Knowledge Upload Processing Cron Job
 *
 * POST /api/cron/process-knowledge-uploads
 *
 * Processes queued knowledge file uploads (files > 1.5MB).
 * Fetches files from blob storage and processes through knowledge service.
 *
 * VERCEL BEST PRACTICES:
 * - maxDuration = 300 (5 min, max for Pro plan)
 * - Process 1-2 files per invocation (embedding is CPU/time intensive)
 * - Early exit if approaching timeout
 * - Cron runs every 2 minutes to pick up pending work
 *
 * SECURITY:
 * 1. Requires CRON_SECRET header for authentication
 * 2. Processes in batches with distributed locking (FOR UPDATE SKIP LOCKED)
 * 3. Handles retries with exponential backoff
 *
 * RECOMMENDED SCHEDULE: Every 2 minutes
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { logger } from "@/lib/utils/logger";
import { jobsRepository } from "@/db/repositories/jobs";
import { getKnowledgeService } from "@/lib/eliza/knowledge-service";
import { userContextService } from "@/lib/eliza/user-context";
import { RuntimeFactory } from "@/lib/eliza/runtime-factory";
import { AgentMode } from "@/lib/eliza/agent-mode-types";
import { usersRepository } from "@/db/repositories/users";
import { deleteBlob, isValidBlobUrl } from "@/lib/blob";
import {
  KNOWLEDGE_CONSTANTS,
  KNOWLEDGE_JOB_TYPE,
} from "@/lib/constants/knowledge";
import type { UUID } from "@elizaos/core";

interface KnowledgeUploadJobData {
  filename: string;
  blobUrl: string;
  contentType: string;
  size: number;
  characterId: string;
  uploadedBy: string;
  uploadedAt: number;
}

// Vercel Pro max is 300s (5 minutes) - use full allowance for embedding operations
export const maxDuration = 300;

// Process only 2 files per invocation - embedding/chunking is expensive
// Each file can take 30-120s depending on size
const BATCH_SIZE = 2;

// Stop processing if we're within 30s of timeout to allow clean exit
const TIMEOUT_BUFFER_MS = 30_000;

function verifyCronSecret(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.error("[Knowledge Cron] CRON_SECRET not configured");
    return false;
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;

  const providedSecret = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  try {
    const secretBuffer = Buffer.from(cronSecret, "utf-8");
    const providedBuffer = Buffer.from(providedSecret, "utf-8");
    if (secretBuffer.length !== providedBuffer.length) return false;
    return timingSafeEqual(secretBuffer, providedBuffer);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  const maxRuntime = (maxDuration * 1000) - TIMEOUT_BUFFER_MS;

  if (!verifyCronSecret(request)) {
    logger.warn("[Knowledge Cron] Unauthorized access attempt");
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  logger.info("[Knowledge Cron] Starting knowledge upload processing");

  const stats = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    recovered: 0,
    skippedDueToTimeout: 0,
  };

  // Helper to check if we should stop processing
  const shouldStop = () => {
    const elapsed = Date.now() - startTime;
    if (elapsed >= maxRuntime) {
      logger.info(`[Knowledge Cron] Approaching timeout (${elapsed}ms elapsed), stopping gracefully`);
      return true;
    }
    return false;
  };

  // Get unique organizations with pending jobs
  const pendingJobs = await jobsRepository.findByFilters({
    type: KNOWLEDGE_JOB_TYPE,
    status: "pending",
    limit: 100,
  });

  const organizationIds = [...new Set(pendingJobs.map((j) => j.organization_id))];

  for (const orgId of organizationIds) {
    if (shouldStop()) break;

    // Recover stale jobs first
    const recovered = await jobsRepository.recoverStaleJobs({
      type: KNOWLEDGE_JOB_TYPE,
      organizationId: orgId,
      staleThresholdMs: KNOWLEDGE_CONSTANTS.STALE_JOB_THRESHOLD_MS,
      maxAttempts: KNOWLEDGE_CONSTANTS.MAX_ATTEMPTS,
    });
    stats.recovered += recovered;

    // Claim jobs for processing - limit to BATCH_SIZE per org
    const claimedJobs = await jobsRepository.claimPendingJobs({
      type: KNOWLEDGE_JOB_TYPE,
      organizationId: orgId,
      limit: BATCH_SIZE,
    });

    for (const job of claimedJobs) {
      // Check timeout before each file - embedding can take 30-120s
      if (shouldStop()) {
        stats.skippedDueToTimeout++;
        // Release the claimed job back to pending for next run
        await jobsRepository.updateStatus(job.id, "pending");
        continue;
      }

      stats.processed++;
      const data = job.data as unknown as KnowledgeUploadJobData;
      const fileStartTime = Date.now();

      try {
        // Get user for context (with organization for buildContext)
        if (!job.user_id) {
          throw new Error("Job missing user_id");
        }
        const user = await usersRepository.findWithOrganization(job.user_id);
        if (!user) {
          throw new Error(`User not found: ${job.user_id}`);
        }

        // Validate blob URL
        if (!isValidBlobUrl(data.blobUrl)) {
          throw new Error("Invalid blob URL");
        }

        // Fetch file from blob storage
        const response = await fetch(data.blobUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch blob: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64Content = buffer.toString("base64");

        // Create runtime and knowledge service
        const userContext = await userContextService.buildContext({
          user,
          isAnonymous: false,
          agentMode: AgentMode.ASSISTANT,
        });

        if (data.characterId) {
          userContext.characterId = data.characterId;
        }

        const runtimeFactory = RuntimeFactory.getInstance();
        const runtime = await runtimeFactory.createRuntimeForUser(userContext);
        const knowledgeService = await getKnowledgeService(runtime);

        if (!knowledgeService) {
          throw new Error("Knowledge service not available");
        }

        // Process the file
        // Use deterministic clientDocumentId based on job ID to prevent duplicates on retry
        const result = await knowledgeService.addKnowledge({
          agentId: runtime.agentId,
          clientDocumentId: job.id as UUID,
          content: base64Content,
          contentType: data.contentType,
          originalFilename: data.filename,
          worldId: runtime.agentId,
          roomId: runtime.agentId,
          entityId: runtime.agentId,
          metadata: {
            uploadedBy: data.uploadedBy,
            uploadedAt: data.uploadedAt,
            organizationId: orgId,
            fileSize: data.size,
            fileName: data.filename,
            filename: data.filename,
            processedByJob: job.id,
          },
        });

        // Mark job as completed
        await jobsRepository.updateStatus(job.id, "completed", {
          result: {
            clientDocumentId: result.clientDocumentId,
            fragmentCount: result.fragmentCount,
          },
          completed_at: new Date(),
        });

        // Clean up blob
        try {
          await deleteBlob(data.blobUrl);
        } catch (cleanupError) {
          logger.warn(`[Knowledge Cron] Failed to cleanup blob for job ${job.id}:`, cleanupError);
        }

        stats.succeeded++;
        const fileDuration = Date.now() - fileStartTime;
        logger.info(`[Knowledge Cron] Processed job ${job.id}: ${data.filename}`, {
          fragmentCount: result.fragmentCount,
          durationMs: fileDuration,
          fileSizeMB: (data.size / 1024 / 1024).toFixed(2),
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        const fileDuration = Date.now() - fileStartTime;
        logger.error(`[Knowledge Cron] Failed to process job ${job.id} after ${fileDuration}ms:`, error);

        await jobsRepository.incrementAttempt(
          job.id,
          errorMessage,
          KNOWLEDGE_CONSTANTS.MAX_ATTEMPTS,
        );
        stats.failed++;
      }
    }
  }

  const totalDuration = Date.now() - startTime;
  logger.info("[Knowledge Cron] Processing completed", {
    ...stats,
    totalDurationMs: totalDuration,
    remainingPending: pendingJobs.length - stats.processed,
  });

  return NextResponse.json({
    success: true,
    stats,
    durationMs: totalDuration,
  });
}

export async function GET(): Promise<NextResponse> {
  // Health check - count pending jobs
  const pendingJobs = await jobsRepository.findByFilters({
    type: KNOWLEDGE_JOB_TYPE,
    status: "pending",
    limit: 1000,
  });

  const inProgressJobs = await jobsRepository.findByFilters({
    type: KNOWLEDGE_JOB_TYPE,
    status: "in_progress",
    limit: 1000,
  });

  return NextResponse.json({
    healthy: true,
    pendingCount: pendingJobs.length,
    inProgressCount: inProgressJobs.length,
    cronSecretConfigured: !!process.env.CRON_SECRET,
  });
}


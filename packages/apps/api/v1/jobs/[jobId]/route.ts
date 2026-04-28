import { NextRequest, NextResponse } from "next/server";
import { getErrorStatusCode, nextJsonFromCaughtError } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { validateServiceKey } from "@/lib/auth/service-key";
import { provisioningJobService } from "@/lib/services/provisioning-jobs";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/jobs/[jobId]
 *
 * Poll the status of an async provisioning job.
 * Returns the full job record including status, result, error, and progress info.
 *
 * Statuses:
 * - pending: Job queued, waiting to be picked up
 * - in_progress: Job is being processed
 * - completed: Job finished successfully (check `result` field)
 * - failed: Job failed after retries exhausted (check `error` field)
 *
 * Auth: Accepts X-Service-Key (service-to-service) OR user auth / API key.
 * Job must belong to the caller's organization.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    // Service-key callers (e.g. waifu.fun) get a jobId from POST /api/v1/agents
    // and need to poll it here. Try service key first, fall back to user auth.
    let organizationId: string;

    const serviceIdentity = validateServiceKey(request);
    if (serviceIdentity) {
      organizationId = serviceIdentity.organizationId;
    } else {
      const { user } = await requireAuthOrApiKeyWithOrg(request);
      organizationId = user.organization_id;
    }

    const { jobId } = await params;

    const job = await provisioningJobService.getJobForOrg(jobId, organizationId);

    if (!job) {
      return NextResponse.json({ success: false, error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: job.id,
        type: job.type,
        status: job.status,
        result: job.result,
        error: job.error,
        attempts: job.attempts,
        maxAttempts: job.max_attempts,
        estimatedCompletionAt: job.estimated_completion_at,
        scheduledFor: job.scheduled_for,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        createdAt: job.created_at,
        updatedAt: job.updated_at,
      },
      // Polling hints for clients
      polling:
        job.status === "pending" || job.status === "in_progress"
          ? {
              intervalMs: 5000,
              shouldContinue: true,
            }
          : {
              shouldContinue: false,
            },
    });
  } catch (error) {
    if (getErrorStatusCode(error) >= 500) {
      logger.error("[Jobs API] Error fetching job:", error);
    }
    return nextJsonFromCaughtError(error);
  }
}

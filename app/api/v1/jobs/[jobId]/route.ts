import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { provisioningJobService } from "@/lib/services/provisioning-jobs";

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
 * Auth: Requires user auth or API key. Job must belong to user's organization.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { jobId } = await params;

    const job = await provisioningJobService.getJob(jobId);

    if (!job) {
      return NextResponse.json(
        { success: false, error: "Job not found" },
        { status: 404 },
      );
    }

    // Authorization: job must belong to the user's organization
    if (job.organization_id !== user.organization_id) {
      return NextResponse.json(
        { success: false, error: "Job not found" },
        { status: 404 },
      );
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
      polling: job.status === "pending" || job.status === "in_progress"
        ? {
            intervalMs: 5000,
            shouldContinue: true,
          }
        : {
            shouldContinue: false,
          },
    });
  } catch (error) {
    logger.error("[Jobs API] Error fetching job:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Failed to fetch job";
    const isAuthError =
      errorMessage.includes("Unauthorized") ||
      errorMessage.includes("Authentication required");

    return NextResponse.json(
      { success: false, error: isAuthError ? "Unauthorized" : errorMessage },
      { status: isAuthError ? 401 : 500 },
    );
  }
}

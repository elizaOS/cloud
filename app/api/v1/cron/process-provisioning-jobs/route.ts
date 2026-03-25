import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { provisioningJobService } from "@/lib/services/provisioning-jobs";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // Provisioning can take up to ~90s per job

function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    logger.error("[Provisioning Jobs] CRON_SECRET not configured - rejecting request for security");
    return false;
  }

  const providedSecret = authHeader?.replace("Bearer ", "") || "";
  const providedBuffer = Buffer.from(providedSecret, "utf8");
  const secretBuffer = Buffer.from(cronSecret, "utf8");

  // Reject immediately on length mismatch — padding to max-length would
  // make timingSafeEqual always compare equal-length buffers but the
  // zero-padded tail leaks nothing useful; however, strict length-equality
  // is the canonical safe pattern and avoids any ambiguity.
  if (providedBuffer.length !== secretBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, secretBuffer);
}

/**
 * Process Provisioning Jobs Cron Handler
 *
 * Claims and executes pending provisioning jobs from the `jobs` table.
 * Uses FOR UPDATE SKIP LOCKED pattern (via JobsRepository) to prevent
 * double-processing when multiple cron invocations overlap.
 *
 * Schedule: Every minute (matches deployment-monitor)
 * Batch size: 5 jobs per invocation
 *
 * Also recovers stale jobs (stuck in_progress > 5 minutes) and retries
 * them with exponential backoff.
 */
async function handleProcessProvisioningJobs(request: NextRequest) {
  try {
    if (!process.env.CRON_SECRET) {
      return NextResponse.json(
        {
          success: false,
          error: "Server configuration error: CRON_SECRET not set",
        },
        { status: 500 },
      );
    }

    if (!verifyCronSecret(request)) {
      logger.warn("[Provisioning Jobs] Unauthorized request", {
        ip: request.headers.get("x-forwarded-for"),
        timestamp: new Date().toISOString(),
      });
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    logger.info("[Provisioning Jobs] Starting job processing cycle");

    const result = await provisioningJobService.processPendingJobs(5);

    if (result.claimed > 0) {
      logger.info("[Provisioning Jobs] Processing complete", {
        claimed: result.claimed,
        succeeded: result.succeeded,
        failed: result.failed,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error(
      "[Provisioning Jobs] Failed:",
      error instanceof Error ? error.message : String(error),
    );

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Provisioning job processing failed",
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/v1/cron/process-provisioning-jobs
 * Protected by CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  return handleProcessProvisioningJobs(request);
}

/**
 * POST /api/v1/cron/process-provisioning-jobs
 * Protected by CRON_SECRET (for manual testing).
 */
export async function POST(request: NextRequest) {
  return handleProcessProvisioningJobs(request);
}

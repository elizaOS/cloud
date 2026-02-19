/**
 * Daily Engagement Metrics Cron Job
 *
 * Aggregates data from conversation_messages, phone_message_log, and
 * Eliza room/memory tables into pre-computed daily_metrics and
 * retention_cohorts tables.
 *
 * Schedule: Daily at 1 AM UTC (0 1 * * *)
 * Protected by CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { userMetricsService } from "@/lib/services/user-metrics";
import { logger } from "@/lib/utils/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    logger.error("[Compute Metrics] CRON_SECRET not configured");
    return false;
  }

  const providedSecret = authHeader?.replace("Bearer ", "") || "";
  const providedBuffer = Buffer.from(providedSecret, "utf8");
  const secretBuffer = Buffer.from(cronSecret, "utf8");

  return (
    providedBuffer.length === secretBuffer.length &&
    timingSafeEqual(providedBuffer, secretBuffer)
  );
}

async function handleComputeMetrics(
  request: NextRequest,
): Promise<NextResponse> {
  const startTime = Date.now();

  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  logger.info("[Compute Metrics] Starting daily metrics computation");

  try {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    await Promise.all([
      userMetricsService.computeDailyMetrics(yesterday),
      userMetricsService.computeRetentionCohorts(yesterday),
    ]);

    const duration = Date.now() - startTime;
    logger.info("[Compute Metrics] Completed", { duration });

    return NextResponse.json({
      success: true,
      data: {
        date: yesterday.toISOString().split("T")[0],
        duration,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error("[Compute Metrics] Failed", {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Metrics computation failed",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return handleComputeMetrics(request);
}

export async function POST(request: NextRequest) {
  return handleComputeMetrics(request);
}

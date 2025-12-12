/**
 * Cron Job: Poll Social Feeds
 *
 * Polls configured social feeds for new engagements (mentions, replies, quotes).
 * Runs every minute to check feeds that are due for polling based on their
 * configured polling interval.
 *
 * Schedule: Every minute (* * * * *)
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { feedPollingService } from "@/lib/services/social-feed/polling";
import { logger } from "@/lib/utils/logger";

const CRON_SECRET = process.env.CRON_SECRET;

function verifyCronSecret(request: NextRequest): boolean {
  if (!CRON_SECRET) {
    logger.warn("[Social Feed Cron] CRON_SECRET not configured");
    return false;
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;

  const providedSecret = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  const secretBuffer = Buffer.from(CRON_SECRET, "utf-8");
  const providedBuffer = Buffer.from(providedSecret, "utf-8");

  if (secretBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(secretBuffer, providedBuffer);
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  logger.info("[Social Feed Cron] Starting feed polling");

  const result = await feedPollingService.pollDueFeeds();

  const duration = Date.now() - startTime;

  logger.info("[Social Feed Cron] Completed", {
    duration,
    feedsPolled: result.feedsPolled,
    newEngagements: result.totalNewEngagements,
    errorCount: result.errors.length,
  });

  return NextResponse.json({
    success: true,
    duration,
    feedsPolled: result.feedsPolled,
    newEngagements: result.totalNewEngagements,
    errors: result.errors,
  });
}

export async function GET(request: NextRequest): Promise<Response> {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { feedConfigService } = await import("@/lib/services/social-feed");

  const dueFeeds = await feedConfigService.getFeedsDueForPolling(100);

  return NextResponse.json({
    success: true,
    dueFeeds: dueFeeds.length,
    feeds: dueFeeds.map((f) => ({
      id: f.id,
      platform: f.source_platform,
      accountId: f.source_account_id,
      lastPolledAt: f.last_polled_at?.toISOString() ?? null,
      pollingInterval: f.polling_interval_seconds,
      errorCount: f.poll_error_count,
    })),
  });
}

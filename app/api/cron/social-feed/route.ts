import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { feedPollingService } from "@/lib/services/social-feed/polling";
import { socialNotificationService } from "@/lib/services/social-feed/notifications";
import { replyConfirmationService } from "@/lib/services/social-feed";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Verify cron secret to prevent unauthorized access
 */
function verifyCronSecret(request: NextRequest): boolean {
  const authorization = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    logger.warn("[Social Feed Cron] CRON_SECRET not configured");
    return false;
  }

  return authorization === `Bearer ${cronSecret}`;
}

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const results: {
    polling: { feedsPolled: number; newEngagements: number; errors: number };
    notifications: { processed: number; successful: number; failed: number };
    expiredConfirmations: number;
  } = {
    polling: { feedsPolled: 0, newEngagements: 0, errors: 0 },
    notifications: { processed: 0, successful: 0, failed: 0 },
    expiredConfirmations: 0,
  };

  logger.info("[Social Feed Cron] Starting job");

  // Step 1: Poll feeds for new engagements
  const pollResult = await feedPollingService.pollDueFeeds();
  results.polling = {
    feedsPolled: pollResult.feedsPolled,
    newEngagements: pollResult.totalNewEngagements,
    errors: pollResult.errors.length,
  };

  if (pollResult.errors.length > 0) {
    logger.warn("[Social Feed Cron] Polling errors", {
      errors: pollResult.errors.slice(0, 5),
    });
  }

  // Step 2: Send notifications for unnotified events
  const notifResult = await socialNotificationService.processUnnotifiedEvents();
  results.notifications = {
    processed: notifResult.processed,
    successful: notifResult.successful,
    failed: notifResult.failed,
  };

  // Step 3: Expire old pending confirmations
  results.expiredConfirmations = await replyConfirmationService.expirePending();

  const duration = Date.now() - startTime;

  logger.info("[Social Feed Cron] Job completed", {
    duration,
    ...results,
  });

  return NextResponse.json({
    success: true,
    duration,
    results,
  });
}

/**
 * GET for health check
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "social-feed-cron",
    timestamp: new Date().toISOString(),
  });
}

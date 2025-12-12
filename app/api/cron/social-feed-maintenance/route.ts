/**
 * Cron Job: Social Feed Maintenance
 *
 * Performs maintenance tasks for the social feed system:
 * 1. Sends notifications for unnotified engagement events
 * 2. Expires old pending reply confirmations
 *
 * Schedule: Every minute (* * * * *)
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { socialNotificationService } from "@/lib/services/social-feed/notifications";
import { replyRouterService } from "@/lib/services/social-feed/reply-router";
import { logger } from "@/lib/utils/logger";

const CRON_SECRET = process.env.CRON_SECRET;

function verifyCronSecret(request: NextRequest): boolean {
  if (!CRON_SECRET) {
    logger.warn("[Social Maintenance Cron] CRON_SECRET not configured");
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

  logger.info("[Social Maintenance Cron] Starting maintenance tasks");

  // Task 1: Process unnotified engagement events
  const notificationResult = await socialNotificationService.processUnnotifiedEvents();

  logger.info("[Social Maintenance Cron] Notifications processed", {
    processed: notificationResult.processed,
    successful: notificationResult.successful,
    failed: notificationResult.failed,
  });

  // Task 2: Expire old pending confirmations
  const expiredCount = await replyRouterService.processExpiredConfirmations();

  logger.info("[Social Maintenance Cron] Confirmations expired", {
    expired: expiredCount,
  });

  const duration = Date.now() - startTime;

  logger.info("[Social Maintenance Cron] Completed", { duration });

  return NextResponse.json({
    success: true,
    duration,
    notifications: notificationResult,
    expiredConfirmations: expiredCount,
  });
}

export async function GET(request: NextRequest): Promise<Response> {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { engagementEventService, replyConfirmationService } = await import(
    "@/lib/services/social-feed"
  );

  const [unnotifiedEvents, pendingConfirmations] = await Promise.all([
    engagementEventService.getUnnotifiedEvents(100),
    replyConfirmationService.getPendingForExpiry(100),
  ]);

  // Webhook configuration health check
  const webhookConfig = {
    slack: {
      configured: !!process.env.SLACK_SIGNING_SECRET,
      warning: !process.env.SLACK_SIGNING_SECRET ? "SLACK_SIGNING_SECRET not set - Slack webhooks will be rejected" : null,
    },
    telegram: {
      configured: !!process.env.TELEGRAM_WEBHOOK_SECRET,
      warning: !process.env.TELEGRAM_WEBHOOK_SECRET ? "TELEGRAM_WEBHOOK_SECRET not set - Telegram webhooks will be rejected" : null,
    },
    alerts: {
      configured: !!(
        process.env.SOCIAL_ALERTS_DISCORD_WEBHOOK ||
        process.env.SOCIAL_ALERTS_SLACK_WEBHOOK ||
        process.env.SOCIAL_ALERTS_TELEGRAM_BOT_TOKEN
      ),
      warning: !(
        process.env.SOCIAL_ALERTS_DISCORD_WEBHOOK ||
        process.env.SOCIAL_ALERTS_SLACK_WEBHOOK ||
        process.env.SOCIAL_ALERTS_TELEGRAM_BOT_TOKEN
      ) ? "No alert channels configured - failures will not be reported" : null,
    },
  };

  const warnings = [
    webhookConfig.slack.warning,
    webhookConfig.telegram.warning,
    webhookConfig.alerts.warning,
  ].filter(Boolean);

  return NextResponse.json({
    success: true,
    unnotifiedEvents: unnotifiedEvents.length,
    expiredConfirmations: pendingConfirmations.length,
    webhookConfig,
    warnings,
    samples: {
      events: unnotifiedEvents.slice(0, 5).map((e) => ({
        id: e.id,
        type: e.event_type,
        platform: e.source_platform,
        author: e.author_username,
        createdAt: e.created_at.toISOString(),
      })),
      confirmations: pendingConfirmations.slice(0, 5).map((c) => ({
        id: c.id,
        status: c.status,
        targetPlatform: c.target_platform,
        expiresAt: c.expires_at.toISOString(),
      })),
    },
  });
}

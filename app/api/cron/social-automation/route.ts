/**
 * Social Media Automation Cron Job
 *
 * Processes scheduled announcements for:
 * - Discord automation
 * - Telegram automation
 * - Twitter automation
 *
 * Should be called every 5 minutes via Vercel Cron.
 * Protected by CRON_SECRET.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { dbRead } from "@/db/client";
import { apps } from "@/db/schemas";
import { discordAppAutomationService } from "@/lib/services/discord-automation/app-automation";
import { telegramAppAutomationService } from "@/lib/services/telegram-automation/app-automation";
import { twitterAppAutomationService } from "@/lib/services/twitter-automation/app-automation";
import { logger } from "@/lib/utils/logger";
import { sql } from "drizzle-orm";
import type { App } from "@/db/schemas/apps";

export const runtime = "nodejs";
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET;

interface AutomationConfig {
  enabled: boolean;
  autoAnnounce?: boolean;
  autoPost?: boolean;
  lastAnnouncementAt?: string;
  lastPostAt?: string;
  announceIntervalMin?: number;
  announceIntervalMax?: number;
  postIntervalMin?: number;
  postIntervalMax?: number;
}

interface ProcessResult {
  appId: string;
  appName: string;
  platform: string;
  success: boolean;
  messageId?: string;
  error?: string;
}

function isAnnouncementDue(
  config: AutomationConfig,
  type: "announcement" | "post"
): boolean {
  if (!config.enabled) return false;

  const autoEnabled =
    type === "announcement" ? config.autoAnnounce : config.autoPost;
  if (!autoEnabled) return false;

  const lastTime =
    type === "announcement" ? config.lastAnnouncementAt : config.lastPostAt;
  if (!lastTime) return true;

  const lastDate = new Date(lastTime);
  const now = new Date();
  const minutesSince = (now.getTime() - lastDate.getTime()) / (1000 * 60);

  const minInterval =
    type === "announcement"
      ? (config.announceIntervalMin ?? 120)
      : (config.postIntervalMin ?? 120);
  const maxInterval =
    type === "announcement"
      ? (config.announceIntervalMax ?? 240)
      : (config.postIntervalMax ?? 240);
  const targetInterval =
    minInterval + Math.random() * (maxInterval - minInterval);

  return minutesSince >= targetInterval;
}

async function getAppsWithAutomation(): Promise<App[]> {
  return dbRead
    .select()
    .from(apps)
    .where(
      sql`${apps.discord_automation}->>'enabled' = 'true' 
          OR ${apps.telegram_automation}->>'enabled' = 'true' 
          OR ${apps.twitter_automation}->>'enabled' = 'true'`
    );
}

async function processDiscordAutomation(
  app: App
): Promise<ProcessResult | null> {
  const config = app.discord_automation as AutomationConfig | null;
  if (!config?.enabled || !config.autoAnnounce) return null;

  const isDue = isAnnouncementDue(config, "announcement");
  if (!isDue) return null;

  const result = await discordAppAutomationService.postAnnouncement(
    app.organization_id,
    app.id
  );

  return {
    appId: app.id,
    appName: app.name,
    platform: "discord",
    success: result.success,
    messageId: result.messageId,
    error: result.error,
  };
}

async function processTelegramAutomation(
  app: App
): Promise<ProcessResult | null> {
  const config = app.telegram_automation as AutomationConfig | null;
  if (!config?.enabled || !config.autoAnnounce) return null;

  const isDue = isAnnouncementDue(config, "announcement");
  if (!isDue) return null;

  const result = await telegramAppAutomationService.postAnnouncement(
    app.organization_id,
    app.id
  );

  return {
    appId: app.id,
    appName: app.name,
    platform: "telegram",
    success: result.success,
    messageId: result.messageId?.toString(),
    error: result.error,
  };
}

async function processTwitterAutomation(
  app: App
): Promise<ProcessResult | null> {
  const config = app.twitter_automation as AutomationConfig | null;
  if (!config?.enabled || !config.autoPost) return null;

  const isDue = isAnnouncementDue(config, "post");
  if (!isDue) return null;

  const result = await twitterAppAutomationService.postAppTweet(
    app.organization_id,
    app.id
  );

  return {
    appId: app.id,
    appName: app.name,
    platform: "twitter",
    success: result.success,
    messageId: result.tweetId,
    error: result.error,
  };
}

export async function POST(request: NextRequest): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const results: ProcessResult[] = [];

  logger.info("[SocialAutomation Cron] Starting");

  const appsWithAutomation = await getAppsWithAutomation();
  logger.info("[SocialAutomation Cron] Found apps with automation", {
    count: appsWithAutomation.length,
  });

  for (const app of appsWithAutomation) {
    // Process Discord
    const discordResult = await processDiscordAutomation(app);
    if (discordResult) {
      results.push(discordResult);
      logger.info("[SocialAutomation Cron] Discord post", {
        appId: app.id,
        success: discordResult.success,
        error: discordResult.error,
      });
    }

    // Process Telegram
    const telegramResult = await processTelegramAutomation(app);
    if (telegramResult) {
      results.push(telegramResult);
      logger.info("[SocialAutomation Cron] Telegram post", {
        appId: app.id,
        success: telegramResult.success,
        error: telegramResult.error,
      });
    }

    // Process Twitter
    const twitterResult = await processTwitterAutomation(app);
    if (twitterResult) {
      results.push(twitterResult);
      logger.info("[SocialAutomation Cron] Twitter post", {
        appId: app.id,
        success: twitterResult.success,
        error: twitterResult.error,
      });
    }
  }

  const duration = Date.now() - startTime;
  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.filter((r) => !r.success).length;

  logger.info("[SocialAutomation Cron] Completed", {
    duration,
    appsProcessed: appsWithAutomation.length,
    postsAttempted: results.length,
    successful: successCount,
    failed: failureCount,
  });

  return NextResponse.json({
    success: true,
    duration,
    stats: {
      appsWithAutomation: appsWithAutomation.length,
      postsAttempted: results.length,
      successful: successCount,
      failed: failureCount,
    },
    results,
  });
}

export async function GET(request: NextRequest): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appsWithAutomation = await getAppsWithAutomation();

  return NextResponse.json({
    status: "ready",
    description: "Social media automation cron job",
    platforms: ["discord", "telegram", "twitter"],
    appsWithAutomation: appsWithAutomation.length,
    tasks: [
      "Process Discord scheduled announcements",
      "Process Telegram scheduled announcements",
      "Process Twitter scheduled posts",
    ],
  });
}

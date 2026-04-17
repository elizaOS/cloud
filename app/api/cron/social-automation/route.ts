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

import { eq, or, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { dbRead } from "@/db/client";
import { apps } from "@/db/schemas";
import { type AppConfig, appConfig } from "@/db/schemas/app-config";
import type { App } from "@/db/schemas/apps";
import { verifyCronSecret } from "@/lib/api/cron-auth";
import { discordAppAutomationService } from "@/lib/services/discord-automation/app-automation";
import { telegramAppAutomationService } from "@/lib/services/telegram-automation/app-automation";
import { twitterAppAutomationService } from "@/lib/services/twitter-automation/app-automation";
import { logger } from "@/lib/utils/logger";

/** App combined with its config for automation processing */
interface AppWithConfig {
  app: App;
  config: AppConfig;
}

// Constants for automation intervals
const DEFAULT_INTERVAL_MIN = 120; // 2 hours minimum
const DEFAULT_INTERVAL_MAX = 240; // 4 hours maximum
const MAX_CONCURRENT_POSTS = 5; // Process up to 5 apps concurrently

export const runtime = "nodejs";
export const maxDuration = 60;

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

/**
 * Generate a deterministic hash value between 0 and 1 from a string.
 * Used to distribute posts across the time window to avoid rate limit spikes.
 */
function hashToFraction(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Convert to positive fraction between 0 and 1
  return Math.abs(hash % 1000) / 1000;
}

function isAnnouncementDue(
  config: AutomationConfig,
  type: "announcement" | "post",
  appId?: string,
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
      ? (config.announceIntervalMin ?? DEFAULT_INTERVAL_MIN)
      : (config.postIntervalMin ?? DEFAULT_INTERVAL_MIN);
  const maxInterval =
    type === "announcement"
      ? (config.announceIntervalMax ?? DEFAULT_INTERVAL_MAX)
      : (config.postIntervalMax ?? DEFAULT_INTERVAL_MAX);

  // Before min interval: not due
  if (minutesSince < minInterval) return false;
  // After max interval: definitely due
  if (minutesSince >= maxInterval) return true;

  // Between min and max: use hash-based threshold to distribute posts
  // Each app gets a different position in the window based on its ID
  const windowProgress =
    (minutesSince - minInterval) / (maxInterval - minInterval);
  const threshold = appId ? hashToFraction(appId + type) : 0.5;
  return windowProgress >= threshold;
}

async function getAppsWithAutomation(): Promise<AppWithConfig[]> {
  const configs = await dbRead
    .select()
    .from(appConfig)
    .where(
      or(
        sql`${appConfig.discord_automation}->>'enabled' = 'true'`,
        sql`${appConfig.telegram_automation}->>'enabled' = 'true'`,
        sql`${appConfig.twitter_automation}->>'enabled' = 'true'`,
      ),
    );

  const results: AppWithConfig[] = [];
  for (const config of configs) {
    const app = await dbRead.query.apps.findFirst({
      where: eq(apps.id, config.app_id),
    });
    if (app) {
      results.push({ app, config });
    }
  }
  return results;
}

async function processDiscordAutomation({
  app,
  config,
}: AppWithConfig): Promise<ProcessResult | null> {
  const automationConfig = config.discord_automation as AutomationConfig | null;
  if (!automationConfig?.enabled || !automationConfig.autoAnnounce) return null;

  const isDue = isAnnouncementDue(automationConfig, "announcement", app.id);
  if (!isDue) return null;

  const result = await discordAppAutomationService.postAnnouncement(
    app.organization_id,
    app.id,
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

async function processTelegramAutomation({
  app,
  config,
}: AppWithConfig): Promise<ProcessResult | null> {
  const automationConfig =
    config.telegram_automation as AutomationConfig | null;
  if (!automationConfig?.enabled || !automationConfig.autoAnnounce) return null;

  const isDue = isAnnouncementDue(automationConfig, "announcement", app.id);
  if (!isDue) return null;

  const result = await telegramAppAutomationService.postAnnouncement(
    app.organization_id,
    app.id,
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

async function processTwitterAutomation({
  app,
  config,
}: AppWithConfig): Promise<ProcessResult | null> {
  const automationConfig = config.twitter_automation as AutomationConfig | null;
  if (!automationConfig?.enabled || !automationConfig.autoPost) return null;

  const isDue = isAnnouncementDue(automationConfig, "post", app.id);
  if (!isDue) return null;

  const result = await twitterAppAutomationService.postAppTweet(
    app.organization_id,
    app.id,
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

/**
 * Process a single app across all platforms
 */
async function processApp(item: AppWithConfig): Promise<ProcessResult[]> {
  const results: ProcessResult[] = [];

  // Process all platforms for this app in parallel
  const [discordResult, telegramResult, twitterResult] = await Promise.all([
    processDiscordAutomation(item).catch((error) => {
      logger.error("[SocialAutomation Cron] Discord error", {
        appId: item.app.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return null;
    }),
    processTelegramAutomation(item).catch((error) => {
      logger.error("[SocialAutomation Cron] Telegram error", {
        appId: item.app.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return null;
    }),
    processTwitterAutomation(item).catch((error) => {
      logger.error("[SocialAutomation Cron] Twitter error", {
        appId: item.app.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return null;
    }),
  ]);

  if (discordResult) {
    results.push(discordResult);
    logger.info("[SocialAutomation Cron] Discord post", {
      appId: item.app.id,
      success: discordResult.success,
      error: discordResult.error,
    });
  }

  if (telegramResult) {
    results.push(telegramResult);
    logger.info("[SocialAutomation Cron] Telegram post", {
      appId: item.app.id,
      success: telegramResult.success,
      error: telegramResult.error,
    });
  }

  if (twitterResult) {
    results.push(twitterResult);
    logger.info("[SocialAutomation Cron] Twitter post", {
      appId: item.app.id,
      success: twitterResult.success,
      error: twitterResult.error,
    });
  }

  return results;
}

/**
 * Process apps in batches with concurrency limit
 */
async function processAppsWithConcurrency(
  items: AppWithConfig[],
  concurrency: number,
): Promise<ProcessResult[]> {
  const results: ProcessResult[] = [];

  // Process in batches
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(processApp));
    results.push(...batchResults.flat());
  }

  return results;
}

export async function POST(request: NextRequest): Promise<Response> {
  const authError = verifyCronSecret(request, "[SocialAutomation Cron]");
  if (authError) return authError;

  const startTime = Date.now();

  logger.info("[SocialAutomation Cron] Starting");

  const appsWithAutomation = await getAppsWithAutomation();
  logger.info("[SocialAutomation Cron] Found apps with automation", {
    count: appsWithAutomation.length,
  });

  // Process apps in parallel with concurrency limit
  const results = await processAppsWithConcurrency(
    appsWithAutomation,
    MAX_CONCURRENT_POSTS,
  );

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

  // Return summary + only failures for large result sets
  const failedResults = results.filter((r) => !r.success);

  return NextResponse.json({
    success: true,
    duration,
    stats: {
      appsWithAutomation: appsWithAutomation.length,
      postsAttempted: results.length,
      successful: successCount,
      failed: failureCount,
    },
    // Only include failures in response to reduce payload size
    failures: failedResults,
  });
}

export async function GET(request: NextRequest): Promise<Response> {
  const authError = verifyCronSecret(request, "[SocialAutomation Cron]");
  if (authError) return authError;

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

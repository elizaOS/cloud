/**
 * Query Alerting System
 * 
 * Sends real-time alerts for very slow queries via Discord/Slack webhooks.
 * Warns on startup if alerting is not configured.
 */

import { logger } from "@/lib/utils/logger";

/** Alert thresholds in milliseconds */
export const ALERT_THRESHOLDS = {
  /** Threshold for slow query tracking (stored in logs) */
  SLOW: 50,
  /** Threshold for warning alerts */
  WARNING: 200,
  /** Threshold for critical alerts */
  CRITICAL: 1000,
} as const;

/** Configuration for query alerting */
interface AlertConfig {
  discordWebhookUrl?: string;
  slackWebhookUrl?: string;
}

/** Slow query alert payload */
interface SlowQueryAlert {
  query: string;
  durationMs: number;
  sourceFile?: string;
  sourceFunction?: string;
  timestamp: Date;
  severity: "warning" | "critical";
}

/** Rate limiting for alerts to prevent spam */
const alertRateLimiter = new Map<string, number>();
const ALERT_COOLDOWN_MS = 60000; // 1 minute between same query alerts

let alertConfig: AlertConfig | null = null;
let configChecked = false;

/**
 * Checks and logs alerting configuration status.
 * Called once on first query instrumentation.
 */
export function checkAlertConfig(): void {
  if (configChecked) return;
  configChecked = true;

  const discordUrl = process.env.DB_SLOW_QUERY_DISCORD_WEBHOOK;
  const slackUrl = process.env.DB_SLOW_QUERY_SLACK_WEBHOOK;

  if (!discordUrl && !slackUrl) {
    logger.warn(
      "\n" +
      "╔══════════════════════════════════════════════════════════════════════════════╗\n" +
      "║  ⚠️  DATABASE SLOW QUERY ALERTS NOT CONFIGURED                                ║\n" +
      "╠══════════════════════════════════════════════════════════════════════════════╣\n" +
      "║  Queries exceeding 200ms will not trigger real-time alerts.                  ║\n" +
      "║                                                                              ║\n" +
      "║  To enable alerts, add one or both of these to your .env.local:              ║\n" +
      "║                                                                              ║\n" +
      "║  DB_SLOW_QUERY_DISCORD_WEBHOOK=https://discord.com/api/webhooks/...          ║\n" +
      "║  DB_SLOW_QUERY_SLACK_WEBHOOK=https://hooks.slack.com/services/...            ║\n" +
      "║                                                                              ║\n" +
      "║  Queries are still being tracked in slow_query_log table and memory.         ║\n" +
      "╚══════════════════════════════════════════════════════════════════════════════╝\n"
    );
    return;
  }

  alertConfig = {
    discordWebhookUrl: discordUrl,
    slackWebhookUrl: slackUrl,
  };

  const enabledChannels: string[] = [];
  if (discordUrl) enabledChannels.push("Discord");
  if (slackUrl) enabledChannels.push("Slack");

  logger.info(
    `[SlowQuery] ✓ Real-time alerts enabled via: ${enabledChannels.join(", ")}`
  );
}

/**
 * Creates a hash for rate limiting.
 */
function getQueryHash(query: string): string {
  // Simple hash - take first 100 chars and normalize
  const normalized = query.replace(/\s+/g, " ").trim().substring(0, 100);
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

/**
 * Checks if alert should be rate limited.
 */
function isRateLimited(queryHash: string): boolean {
  const lastAlert = alertRateLimiter.get(queryHash);
  if (!lastAlert) return false;
  return Date.now() - lastAlert < ALERT_COOLDOWN_MS;
}

/**
 * Sends alert to Discord webhook.
 */
async function sendDiscordAlert(alert: SlowQueryAlert): Promise<void> {
  if (!alertConfig?.discordWebhookUrl) return;

  const color = alert.severity === "critical" ? 0xff0000 : 0xffaa00;
  const emoji = alert.severity === "critical" ? "🔴" : "🟡";

  const truncatedQuery = alert.query.length > 500 
    ? alert.query.substring(0, 500) + "..." 
    : alert.query;

  const payload = {
    embeds: [{
      title: `${emoji} Slow Database Query`,
      color,
      fields: [
        { name: "Duration", value: `${alert.durationMs}ms`, inline: true },
        { name: "Severity", value: alert.severity.toUpperCase(), inline: true },
        { name: "Source", value: alert.sourceFile ? `${alert.sourceFile}:${alert.sourceFunction || "unknown"}` : "Unknown", inline: true },
        { name: "Query", value: `\`\`\`sql\n${truncatedQuery}\n\`\`\`` },
      ],
      timestamp: alert.timestamp.toISOString(),
    }],
  };

  const response = await fetch(alertConfig.discordWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    logger.error(`[SlowQuery] Discord alert failed: ${response.status}`);
  }
}

/**
 * Sends alert to Slack webhook.
 */
async function sendSlackAlert(alert: SlowQueryAlert): Promise<void> {
  if (!alertConfig?.slackWebhookUrl) return;

  const emoji = alert.severity === "critical" ? ":red_circle:" : ":large_yellow_circle:";

  const truncatedQuery = alert.query.length > 500 
    ? alert.query.substring(0, 500) + "..." 
    : alert.query;

  const payload = {
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `${emoji} Slow Database Query`, emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Duration:*\n${alert.durationMs}ms` },
          { type: "mrkdwn", text: `*Severity:*\n${alert.severity.toUpperCase()}` },
          { type: "mrkdwn", text: `*Source:*\n${alert.sourceFile || "Unknown"}` },
        ],
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Query:*\n\`\`\`${truncatedQuery}\`\`\`` },
      },
    ],
  };

  const response = await fetch(alertConfig.slackWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    logger.error(`[SlowQuery] Slack alert failed: ${response.status}`);
  }
}

/**
 * Sends slow query alert to configured channels.
 * 
 * Only sends for queries exceeding WARNING threshold (200ms).
 * Rate limited to prevent alert spam.
 */
export async function sendSlowQueryAlert(alert: SlowQueryAlert): Promise<void> {
  if (!alertConfig) return;

  const queryHash = getQueryHash(alert.query);
  
  if (isRateLimited(queryHash)) {
    return;
  }

  alertRateLimiter.set(queryHash, Date.now());

  // Send alerts in parallel
  await Promise.allSettled([
    sendDiscordAlert(alert),
    sendSlackAlert(alert),
  ]);
}

/**
 * Determines alert severity based on duration.
 */
export function getAlertSeverity(durationMs: number): "warning" | "critical" | null {
  if (durationMs >= ALERT_THRESHOLDS.CRITICAL) return "critical";
  if (durationMs >= ALERT_THRESHOLDS.WARNING) return "warning";
  return null;
}

/**
 * Clears the rate limiter - useful for testing.
 */
export function clearRateLimiter(): void {
  alertRateLimiter.clear();
}


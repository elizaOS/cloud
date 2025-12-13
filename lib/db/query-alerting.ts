/**
 * Query Alerting - Real-time alerts for slow queries via Discord/Slack.
 */

export const ALERT_THRESHOLDS = {
  SLOW: 50,
  WARNING: 200,
  CRITICAL: 1000,
} as const;

interface AlertConfig {
  discordWebhookUrl?: string;
  slackWebhookUrl?: string;
}

interface SlowQueryAlert {
  query: string;
  durationMs: number;
  sourceFile?: string;
  sourceFunction?: string;
  timestamp: Date;
  severity: "warning" | "critical";
}

const ALERT_COOLDOWN_MS = 60000;
const alertRateLimiter = new Map<string, number>();

let alertConfig: AlertConfig | null = null;
let configChecked = false;

/**
 * Checks and logs alerting configuration. Called once on startup.
 */
export function checkAlertConfig(): void {
  if (configChecked) return;
  configChecked = true;

  const discordUrl = process.env.DB_SLOW_QUERY_DISCORD_WEBHOOK;
  const slackUrl = process.env.DB_SLOW_QUERY_SLACK_WEBHOOK;

  if (!discordUrl && !slackUrl) {
    console.warn(
      "\n" +
        "╔══════════════════════════════════════════════════════════════════════════════╗\n" +
        "║  ⚠️  DATABASE SLOW QUERY ALERTS NOT CONFIGURED                                ║\n" +
        "╠══════════════════════════════════════════════════════════════════════════════╣\n" +
        "║  Queries >200ms won't trigger real-time alerts.                              ║\n" +
        "║                                                                              ║\n" +
        "║  To enable, add to .env.local:                                               ║\n" +
        "║    DB_SLOW_QUERY_DISCORD_WEBHOOK=https://discord.com/api/webhooks/...        ║\n" +
        "║    DB_SLOW_QUERY_SLACK_WEBHOOK=https://hooks.slack.com/services/...          ║\n" +
        "║                                                                              ║\n" +
        "║  Slow queries are still tracked in slow_query_log table.                     ║\n" +
        "╚══════════════════════════════════════════════════════════════════════════════╝\n"
    );
    return;
  }

  alertConfig = { discordWebhookUrl: discordUrl, slackWebhookUrl: slackUrl };

  const channels = [discordUrl && "Discord", slackUrl && "Slack"].filter(Boolean);
  console.info(`[DB] ✓ Slow query alerts enabled via: ${channels.join(", ")}`);
}

function hashForRateLimit(query: string): string {
  const normalized = query.replace(/\s+/g, " ").trim().substring(0, 100);
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) - hash) + normalized.charCodeAt(i);
    hash = hash & hash;
  }
  return hash.toString(36);
}

function isRateLimited(hash: string): boolean {
  const last = alertRateLimiter.get(hash);
  return last ? Date.now() - last < ALERT_COOLDOWN_MS : false;
}

async function sendDiscordAlert(alert: SlowQueryAlert): Promise<void> {
  if (!alertConfig?.discordWebhookUrl) return;

  const color = alert.severity === "critical" ? 0xff0000 : 0xffaa00;
  const emoji = alert.severity === "critical" ? "🔴" : "🟡";
  const truncated = alert.query.length > 500 ? alert.query.substring(0, 500) + "..." : alert.query;

  await fetch(alertConfig.discordWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [
        {
          title: `${emoji} Slow Database Query`,
          color,
          fields: [
            { name: "Duration", value: `${alert.durationMs}ms`, inline: true },
            { name: "Severity", value: alert.severity.toUpperCase(), inline: true },
            { name: "Query", value: `\`\`\`sql\n${truncated}\n\`\`\`` },
          ],
          timestamp: alert.timestamp.toISOString(),
        },
      ],
    }),
  }).catch((e: Error) => console.debug("[QueryAlert] Discord webhook failed:", e.message));
}

async function sendSlackAlert(alert: SlowQueryAlert): Promise<void> {
  if (!alertConfig?.slackWebhookUrl) return;

  const emoji = alert.severity === "critical" ? ":red_circle:" : ":large_yellow_circle:";
  const truncated = alert.query.length > 500 ? alert.query.substring(0, 500) + "..." : alert.query;

  await fetch(alertConfig.slackWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      blocks: [
        { type: "header", text: { type: "plain_text", text: `${emoji} Slow Database Query`, emoji: true } },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Duration:*\n${alert.durationMs}ms` },
            { type: "mrkdwn", text: `*Severity:*\n${alert.severity.toUpperCase()}` },
          ],
        },
        { type: "section", text: { type: "mrkdwn", text: `*Query:*\n\`\`\`${truncated}\`\`\`` } },
      ],
    }),
  }).catch((e: Error) => console.debug("[QueryAlert] Slack webhook failed:", e.message));
}

/**
 * Sends slow query alert to configured channels. Rate-limited per query.
 */
export async function sendSlowQueryAlert(alert: SlowQueryAlert): Promise<void> {
  if (!alertConfig) return;

  const hash = hashForRateLimit(alert.query);
  if (isRateLimited(hash)) return;

  alertRateLimiter.set(hash, Date.now());
  await Promise.allSettled([sendDiscordAlert(alert), sendSlackAlert(alert)]);
}

/**
 * Returns severity level based on query duration.
 */
export function getAlertSeverity(durationMs: number): "warning" | "critical" | null {
  if (durationMs >= ALERT_THRESHOLDS.CRITICAL) return "critical";
  if (durationMs >= ALERT_THRESHOLDS.WARNING) return "warning";
  return null;
}

export function clearRateLimiter(): void {
  alertRateLimiter.clear();
}

/**
 * Resets all module state. For testing only.
 */
export function resetAlertingState(): void {
  alertRateLimiter.clear();
  alertConfig = null;
  configChecked = false;
}

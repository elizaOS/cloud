import { logger } from "@/lib/utils/logger";

type AlertSeverity = "critical" | "high" | "medium" | "low";
type AlertChannel = "discord" | "slack" | "telegram" | "whatsapp";

interface AlertPayload {
  severity: AlertSeverity;
  title: string;
  message: string;
  details?: Record<string, unknown>;
  platforms?: string[];
}

interface AlertConfig {
  discord?: { webhookUrl: string };
  slack?: { webhookUrl: string };
  telegram?: { botToken: string; chatId: string };
  whatsapp?: { apiUrl: string; apiKey: string; to: string };
}

const SEVERITY_COLORS: Record<AlertSeverity, { hex: string; emoji: string }> = {
  critical: { hex: "#FF0000", emoji: "🚨" },
  high: { hex: "#FF8C00", emoji: "⚠️" },
  medium: { hex: "#FFD700", emoji: "📊" },
  low: { hex: "#00CED1", emoji: "ℹ️" },
};

function getConfig(): AlertConfig {
  return {
    discord: process.env.SOCIAL_ALERTS_DISCORD_WEBHOOK
      ? { webhookUrl: process.env.SOCIAL_ALERTS_DISCORD_WEBHOOK }
      : undefined,
    slack: process.env.SOCIAL_ALERTS_SLACK_WEBHOOK
      ? { webhookUrl: process.env.SOCIAL_ALERTS_SLACK_WEBHOOK }
      : undefined,
    telegram: process.env.SOCIAL_ALERTS_TELEGRAM_BOT_TOKEN && process.env.SOCIAL_ALERTS_TELEGRAM_CHAT_ID
      ? { botToken: process.env.SOCIAL_ALERTS_TELEGRAM_BOT_TOKEN, chatId: process.env.SOCIAL_ALERTS_TELEGRAM_CHAT_ID }
      : undefined,
    whatsapp: process.env.SOCIAL_ALERTS_WHATSAPP_API_URL && process.env.SOCIAL_ALERTS_WHATSAPP_API_KEY && process.env.SOCIAL_ALERTS_WHATSAPP_TO
      ? { apiUrl: process.env.SOCIAL_ALERTS_WHATSAPP_API_URL, apiKey: process.env.SOCIAL_ALERTS_WHATSAPP_API_KEY, to: process.env.SOCIAL_ALERTS_WHATSAPP_TO }
      : undefined,
  };
}

async function sendDiscordAlert(webhookUrl: string, payload: AlertPayload): Promise<void> {
  const { hex, emoji } = SEVERITY_COLORS[payload.severity];

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [{
        title: `${emoji} ${payload.title}`,
        description: payload.message,
        color: parseInt(hex.slice(1), 16),
        fields: payload.platforms?.length
          ? [{ name: "Platforms", value: payload.platforms.join(", "), inline: true }]
          : [],
        timestamp: new Date().toISOString(),
      }],
    }),
  });
}

async function sendSlackAlert(webhookUrl: string, payload: AlertPayload): Promise<void> {
  const { emoji } = SEVERITY_COLORS[payload.severity];

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      blocks: [
        { type: "header", text: { type: "plain_text", text: `${emoji} ${payload.title}`, emoji: true } },
        { type: "section", text: { type: "mrkdwn", text: payload.message } },
        ...(payload.platforms?.length
          ? [{ type: "section", fields: [{ type: "mrkdwn", text: `*Platforms:* ${payload.platforms.join(", ")}` }] }]
          : []),
      ],
    }),
  });
}

async function sendTelegramAlert(botToken: string, chatId: string, payload: AlertPayload): Promise<void> {
  const { emoji } = SEVERITY_COLORS[payload.severity];
  const text = [
    `${emoji} *${payload.title}*`,
    "",
    payload.message,
    ...(payload.platforms?.length ? ["", `Platforms: ${payload.platforms.join(", ")}`] : []),
  ].join("\n");

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
}

async function sendWhatsAppAlert(apiUrl: string, apiKey: string, to: string, payload: AlertPayload): Promise<void> {
  const { emoji } = SEVERITY_COLORS[payload.severity];
  const text = [
    `${emoji} ${payload.title}`,
    "",
    payload.message,
    ...(payload.platforms?.length ? ["", `Platforms: ${payload.platforms.join(", ")}`] : []),
  ].join("\n");

  await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ to, message: text }),
  });
}

export async function sendSocialMediaAlert(payload: AlertPayload): Promise<void> {
  const config = getConfig();
  const enabledChannels: AlertChannel[] = [];

  if (config.discord) enabledChannels.push("discord");
  if (config.slack) enabledChannels.push("slack");
  if (config.telegram) enabledChannels.push("telegram");
  if (config.whatsapp) enabledChannels.push("whatsapp");

  if (enabledChannels.length === 0) {
    logger.warn("[SocialMediaAlerts] No alert channels configured");
    return;
  }

  const sends = enabledChannels.map(async (channel) => {
    switch (channel) {
      case "discord":
        return sendDiscordAlert(config.discord!.webhookUrl, payload);
      case "slack":
        return sendSlackAlert(config.slack!.webhookUrl, payload);
      case "telegram":
        return sendTelegramAlert(config.telegram!.botToken, config.telegram!.chatId, payload);
      case "whatsapp":
        return sendWhatsAppAlert(config.whatsapp!.apiUrl, config.whatsapp!.apiKey, config.whatsapp!.to, payload);
    }
  });

  const results = await Promise.allSettled(sends);
  const failures = results.filter(r => r.status === "rejected");

  if (failures.length > 0) {
    logger.error(`[SocialMediaAlerts] ${failures.length}/${results.length} channels failed`);
  }
}

export async function alertOnPostFailure(
  organizationId: string,
  platforms: string[],
  errors: string[]
): Promise<void> {
  const allFailed = errors.length === platforms.length;

  await sendSocialMediaAlert({
    severity: allFailed ? "high" : "medium",
    title: allFailed ? "All Social Media Posts Failed" : "Partial Social Media Post Failure",
    message: `${errors.length}/${platforms.length} posts failed for org ${organizationId.slice(0, 8)}...`,
    platforms,
    details: { errors },
  });
}

export async function alertOnTokenExpiry(
  organizationId: string,
  platform: string
): Promise<void> {
  await sendSocialMediaAlert({
    severity: "medium",
    title: "Social Media Token Expired",
    message: `Token for ${platform} expired and could not be refreshed. Re-authentication required.`,
    platforms: [platform],
    details: { organizationId },
  });
}

export async function alertOnRateLimit(
  platform: string,
  retryAfter?: number
): Promise<void> {
  await sendSocialMediaAlert({
    severity: "low",
    title: "Social Media Rate Limited",
    message: `${platform} API rate limit reached. ${retryAfter ? `Retry after ${retryAfter}s.` : ""}`,
    platforms: [platform],
  });
}

import { logger } from "@/lib/utils/logger";
import { telegramService } from "@/lib/services/telegram";
import { botsService } from "@/lib/services/bots";
import { secretsService } from "@/lib/services/secrets";
import {
  engagementEventService,
  notificationMessageService,
  feedConfigService,
  type SocialEngagementEvent,
  type NotificationChannel,
  type OrgFeedConfig,
} from "./index";

interface NotificationResult {
  success: boolean;
  platform: string;
  channelId: string;
  messageId?: string;
  error?: string;
}

interface FormattedNotification {
  text: string;
  embed?: DiscordEmbed;
  blocks?: SlackBlock[];
  replyMarkup?: TelegramInlineKeyboard;
}

interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  author?: {
    name: string;
    icon_url?: string;
    url?: string;
  };
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string };
  timestamp?: string;
}

interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  accessory?: unknown;
  elements?: unknown[];
}

interface TelegramInlineKeyboard {
  inline_keyboard: Array<Array<{ text: string; url?: string; callback_data?: string }>>;
}

function getEventTypeEmoji(eventType: string): string {
  switch (eventType) {
    case "mention":
      return "📣";
    case "reply":
      return "💬";
    case "quote_tweet":
      return "🔁";
    case "repost":
      return "♻️";
    case "like":
      return "❤️";
    case "comment":
      return "💭";
    case "follow":
      return "👋";
    default:
      return "📢";
  }
}

function getEventTypeLabel(eventType: string): string {
  switch (eventType) {
    case "mention":
      return "New Mention";
    case "reply":
      return "New Reply";
    case "quote_tweet":
      return "Quote Tweet";
    case "repost":
      return "Repost";
    case "like":
      return "Like";
    case "comment":
      return "Comment";
    case "follow":
      return "New Follower";
    default:
      return "Engagement";
  }
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

function formatForDiscord(event: SocialEngagementEvent): FormattedNotification {
  const emoji = getEventTypeEmoji(event.event_type);
  const label = getEventTypeLabel(event.event_type);

  const authorDisplay = event.author_display_name || event.author_username || "Someone";
  const authorHandle = event.author_username ? `@${event.author_username}` : "";
  const verifiedBadge = event.author_verified ? " ✓" : "";
  const followerText = event.author_follower_count
    ? ` • ${event.author_follower_count.toLocaleString()} followers`
    : "";

  const embed: DiscordEmbed = {
    title: `${emoji} ${label}`,
    color: getColorForEventType(event.event_type),
    author: {
      name: `${authorDisplay}${verifiedBadge} ${authorHandle}`,
      icon_url: event.author_avatar_url ?? undefined,
      url: event.source_post_url ?? undefined,
    },
    timestamp: event.created_at.toISOString(),
  };

  if (event.content) {
    embed.description = truncateText(event.content, 4000);
  }

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  if (event.original_post_content) {
    fields.push({
      name: "In response to",
      value: truncateText(event.original_post_content, 1000),
      inline: false,
    });
  }

  if (event.source_post_url) {
    fields.push({
      name: "Link",
      value: `[View on ${event.source_platform}](${event.source_post_url})`,
      inline: true,
    });
  }

  if (event.original_post_url && event.original_post_url !== event.source_post_url) {
    fields.push({
      name: "Original",
      value: `[View original](${event.original_post_url})`,
      inline: true,
    });
  }

  if (fields.length > 0) {
    embed.fields = fields;
  }

  const metrics = event.engagement_metrics;
  if (metrics) {
    const stats: string[] = [];
    if (metrics.likes) stats.push(`${metrics.likes} ❤️`);
    if (metrics.reposts) stats.push(`${metrics.reposts} 🔁`);
    if (metrics.replies) stats.push(`${metrics.replies} 💬`);
    if (stats.length > 0) {
      embed.footer = { text: stats.join(" • ") + followerText };
    }
  }

  return {
    text: `${emoji} **${label}** from ${authorDisplay}${authorHandle}`,
    embed,
  };
}

function formatForTelegram(event: SocialEngagementEvent): FormattedNotification {
  const emoji = getEventTypeEmoji(event.event_type);
  const label = getEventTypeLabel(event.event_type);

  const authorDisplay = event.author_display_name || event.author_username || "Someone";
  const authorHandle = event.author_username ? `@${event.author_username}` : "";
  const verifiedBadge = event.author_verified ? " ✓" : "";
  const followerText = event.author_follower_count
    ? `\n👥 ${event.author_follower_count.toLocaleString()} followers`
    : "";

  let text = `${emoji} <b>${label}</b>\n\n`;
  text += `<b>${authorDisplay}</b>${verifiedBadge} ${authorHandle}${followerText}\n\n`;

  if (event.content) {
    text += `${escapeHtml(truncateText(event.content, 3500))}\n\n`;
  }

  if (event.original_post_content) {
    text += `<i>In response to:</i>\n`;
    text += `<blockquote>${escapeHtml(truncateText(event.original_post_content, 500))}</blockquote>\n\n`;
  }

  const metrics = event.engagement_metrics;
  if (metrics) {
    const stats: string[] = [];
    if (metrics.likes) stats.push(`${metrics.likes} ❤️`);
    if (metrics.reposts) stats.push(`${metrics.reposts} 🔁`);
    if (metrics.replies) stats.push(`${metrics.replies} 💬`);
    if (stats.length > 0) {
      text += stats.join(" • ") + "\n\n";
    }
  }

  text += "💬 <i>Reply to this message to respond</i>";

  const buttons: Array<{ text: string; url?: string; callback_data?: string }> = [];

  if (event.source_post_url) {
    buttons.push({
      text: `View on ${event.source_platform}`,
      url: event.source_post_url,
    });
  }

  if (event.original_post_url && event.original_post_url !== event.source_post_url) {
    buttons.push({
      text: "View Original",
      url: event.original_post_url,
    });
  }

  const replyMarkup: TelegramInlineKeyboard = {
    inline_keyboard: buttons.length > 0 ? [buttons] : [],
  };

  return { text, replyMarkup };
}

function formatForSlack(event: SocialEngagementEvent): FormattedNotification {
  const emoji = getEventTypeEmoji(event.event_type);
  const label = getEventTypeLabel(event.event_type);

  const authorDisplay = event.author_display_name || event.author_username || "Someone";
  const authorHandle = event.author_username ? `@${event.author_username}` : "";
  const verifiedBadge = event.author_verified ? " :white_check_mark:" : "";
  const followerText = event.author_follower_count
    ? ` • ${event.author_follower_count.toLocaleString()} followers`
    : "";

  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${emoji} ${label}`,
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${authorDisplay}*${verifiedBadge} ${authorHandle}${followerText}`,
      },
    },
  ];

  if (event.content) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: truncateText(event.content, 3000),
      },
    });
  }

  if (event.original_post_content) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `_In response to:_\n>${truncateText(event.original_post_content, 500)}`,
      },
    });
  }

  const contextElements: string[] = [];
  const slackMetrics = event.engagement_metrics;
  if (slackMetrics) {
    if (slackMetrics.likes) contextElements.push(`${slackMetrics.likes} :heart:`);
    if (slackMetrics.reposts) contextElements.push(`${slackMetrics.reposts} :recycle:`);
    if (slackMetrics.replies) contextElements.push(`${slackMetrics.replies} :speech_balloon:`);
  }

  if (event.source_post_url) {
    contextElements.push(`<${event.source_post_url}|View on ${event.source_platform}>`);
  }

  if (contextElements.length > 0) {
    blocks.push({
      type: "context",
      elements: contextElements.map((t) => ({ type: "mrkdwn", text: t })),
    });
  }

  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: "_Reply in thread to respond_" },
  });

  return { text: `${emoji} *${label}* from ${authorDisplay}`, blocks };
}

function getColorForEventType(eventType: string): number {
  switch (eventType) {
    case "mention":
      return 0x1da1f2; // Twitter blue
    case "reply":
      return 0x17bf63; // Green
    case "quote_tweet":
      return 0x794bc4; // Purple
    case "repost":
      return 0x00ba7c; // Teal
    case "like":
      return 0xe0245e; // Red/pink
    default:
      return 0x657786; // Gray
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function sendToDiscord(
  channel: NotificationChannel,
  notification: FormattedNotification,
  organizationId: string
): Promise<NotificationResult> {
  try {
    const connections = await botsService.getConnections(organizationId);
    const discordConnection = connections.find(
      (c) => c.platform === "discord" && c.status === "active" &&
        (channel.connectionId ? c.id === channel.connectionId : true)
    );

    if (!discordConnection) {
      return {
        success: false,
        platform: "discord",
        channelId: channel.channelId,
        error: "No active Discord connection",
      };
    }

    const botToken = await botsService.getBotToken(discordConnection.id, organizationId);

    const payload: Record<string, unknown> = {
      content: notification.text,
    };

    if (notification.embed) {
      payload.embeds = [notification.embed];
    }

    const response = await fetch(
      `https://discord.com/api/v10/channels/${channel.channelId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Discord API error: ${response.status} - ${error}`);
    }

    const message = await response.json();

    return {
      success: true,
      platform: "discord",
      channelId: channel.channelId,
      messageId: message.id,
    };
  } catch (error) {
    logger.error("[Notifications] Discord send failed", { error });
    return {
      success: false,
      platform: "discord",
      channelId: channel.channelId,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function sendToTelegram(
  channel: NotificationChannel,
  notification: FormattedNotification,
  organizationId: string
): Promise<NotificationResult> {
  try {
    const connections = await botsService.getConnections(organizationId);
    const telegramConnection = connections.find(
      (c) => c.platform === "telegram" && c.status === "active" &&
        (channel.connectionId ? c.id === channel.connectionId : true)
    );

    if (!telegramConnection) {
      return {
        success: false,
        platform: "telegram",
        channelId: channel.channelId,
        error: "No active Telegram connection",
      };
    }

    const message = await telegramService.sendMessageViaConnection(
      telegramConnection.id,
      organizationId,
      channel.channelId,
      notification.text,
      {
        parse_mode: "HTML",
        reply_markup: notification.replyMarkup,
      }
    );

    return {
      success: true,
      platform: "telegram",
      channelId: channel.channelId,
      messageId: String(message.message_id),
    };
  } catch (error) {
    logger.error("[Notifications] Telegram send failed", { error });
    return {
      success: false,
      platform: "telegram",
      channelId: channel.channelId,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function sendToSlack(
  channel: NotificationChannel,
  notification: FormattedNotification,
  organizationId: string
): Promise<NotificationResult> {
  try {
    const botToken = await secretsService.get(organizationId, "SLACK_BOT_TOKEN");

    if (!botToken) {
      return {
        success: false,
        platform: "slack",
        channelId: channel.channelId,
        error: "No Slack bot token configured",
      };
    }

    const payload: Record<string, unknown> = {
      channel: channel.channelId,
      text: notification.text,
    };

    if (notification.blocks) {
      payload.blocks = notification.blocks;
    }

    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${botToken}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.error ?? "Slack API error");
    }

    return {
      success: true,
      platform: "slack",
      channelId: channel.channelId,
      messageId: data.ts,
    };
  } catch (error) {
    logger.error("[Notifications] Slack send failed", { error });
    return {
      success: false,
      platform: "slack",
      channelId: channel.channelId,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

class SocialNotificationService {
  async sendNotification(
    event: SocialEngagementEvent,
    config: OrgFeedConfig
  ): Promise<NotificationResult[]> {
    const channels = config.notification_channels ?? [];
    const results: NotificationResult[] = [];

    logger.info("[Notifications] Sending notifications", {
      eventId: event.id,
      eventType: event.event_type,
      channelCount: channels.length,
    });

    for (const channel of channels) {
      let notification: FormattedNotification;
      let result: NotificationResult;

      switch (channel.platform) {
        case "discord":
          notification = formatForDiscord(event);
          result = await sendToDiscord(channel, notification, config.organization_id);
          break;
        case "telegram":
          notification = formatForTelegram(event);
          result = await sendToTelegram(channel, notification, config.organization_id);
          break;
        case "slack":
          notification = formatForSlack(event);
          result = await sendToSlack(channel, notification, config.organization_id);
          break;
        default:
          result = {
            success: false,
            platform: channel.platform,
            channelId: channel.channelId,
            error: `Unsupported platform: ${channel.platform}`,
          };
      }

      results.push(result);

      if (result.success && result.messageId) {
        await notificationMessageService.create(
          config.organization_id,
          event.id,
          channel.platform,
          channel.channelId,
          result.messageId,
          channel.serverId,
          channel.threadId
        );
      }
    }

    const successfulChannels = results.filter((r) => r.success);
    if (successfulChannels.length > 0) {
      const messageIds: Record<string, string> = {};
      for (const result of successfulChannels) {
        if (result.messageId) {
          messageIds[`${result.platform}:${result.channelId}`] = result.messageId;
        }
      }

      await engagementEventService.markNotificationSent(
        event.id,
        successfulChannels.map((r) => `${r.platform}:${r.channelId}`),
        messageIds
      );
    }

    logger.info("[Notifications] Notification complete", {
      eventId: event.id,
      successCount: successfulChannels.length,
      failCount: results.length - successfulChannels.length,
    });

    return results;
  }

  async processUnnotifiedEvents(): Promise<{
    processed: number;
    successful: number;
    failed: number;
  }> {
    const events = await engagementEventService.getUnnotifiedEvents(50);

    logger.info("[Notifications] Processing unnotified events", { count: events.length });

    let successful = 0;
    let failed = 0;

    for (const event of events) {
      const config = await feedConfigService.get(event.feed_config_id, event.organization_id);
      if (!config || !config.enabled) {
        await engagementEventService.markNotificationSent(event.id, [], {});
        continue;
      }

      const results = await this.sendNotification(event, config);
      const hasSuccess = results.some((r) => r.success);

      if (hasSuccess) {
        successful++;
      } else {
        failed++;
      }
    }

    return {
      processed: events.length,
      successful,
      failed,
    };
  }
}

export const socialNotificationService = new SocialNotificationService();

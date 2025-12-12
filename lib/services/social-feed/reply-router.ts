import { logger } from "@/lib/utils/logger";
import { socialMediaService } from "@/lib/services/social-media";
import { telegramService } from "@/lib/services/telegram";
import { botsService } from "@/lib/services/bots";
import { secretsService } from "@/lib/services/secrets";
import type { SocialPlatform, PostContent } from "@/lib/types/social-media";
import {
  replyConfirmationService,
  notificationMessageService,
  engagementEventService,
  feedConfigService,
  type PendingReplyConfirmation,
  type SocialEngagementEvent,
} from "./index";


interface IncomingReply {
  platform: "discord" | "telegram" | "slack";
  channelId: string;
  serverId?: string;
  messageId: string;
  replyToMessageId: string;
  userId: string;
  username?: string;
  displayName?: string;
  content: string;
  mediaUrls?: string[];
}

interface ConfirmationPromptResult {
  success: boolean;
  confirmationId: string;
  promptMessageId?: string;
  error?: string;
}

interface ReplyPostResult {
  success: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
}


function formatConfirmationForDiscord(
  event: SocialEngagementEvent,
  replyContent: string,
  confirmationId: string
): {
  content: string;
  embeds: Array<{
    title: string;
    description: string;
    color: number;
    fields: Array<{ name: string; value: string; inline?: boolean }>;
    footer: { text: string };
  }>;
  components: Array<{
    type: number;
    components: Array<{
      type: number;
      style: number;
      label: string;
      custom_id: string;
      emoji?: { name: string };
    }>;
  }>;
} {
  const authorDisplay = event.author_display_name || event.author_username || "Unknown";

  return {
    content: "📤 **Reply Confirmation Required**",
    embeds: [
      {
        title: "Send this reply?",
        description: replyContent,
        color: 0xf0b132, // Yellow/orange for pending
        fields: [
          {
            name: "Replying to",
            value: `${authorDisplay} on ${event.source_platform}`,
            inline: true,
          },
          {
            name: "Original post",
            value: event.source_post_url ?? "N/A",
            inline: true,
          },
        ],
        footer: {
          text: "This will be posted publicly. Expires in 24 hours.",
        },
      },
    ],
    components: [
      {
        type: 1, // Action Row
        components: [
          {
            type: 2, // Button
            style: 3, // Success (green)
            label: "Approve & Send",
            custom_id: `reply_confirm:${confirmationId}`,
            emoji: { name: "✅" },
          },
          {
            type: 2,
            style: 4, // Danger (red)
            label: "Reject",
            custom_id: `reply_reject:${confirmationId}`,
            emoji: { name: "❌" },
          },
        ],
      },
    ],
  };
}

function formatConfirmationForTelegram(
  event: SocialEngagementEvent,
  replyContent: string,
  confirmationId: string
): {
  text: string;
  replyMarkup: {
    inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
  };
} {
  const authorDisplay = event.author_display_name || event.author_username || "Unknown";

  const text = `📤 <b>Reply Confirmation Required</b>

<b>Your reply:</b>
${escapeHtml(replyContent)}

<b>Replying to:</b> ${authorDisplay} on ${event.source_platform}
<b>Original:</b> ${event.source_post_url ?? "N/A"}

<i>This will be posted publicly. Expires in 24 hours.</i>`;

  return {
    text,
    replyMarkup: {
      inline_keyboard: [
        [
          { text: "✅ Approve & Send", callback_data: `reply_confirm:${confirmationId}` },
          { text: "❌ Reject", callback_data: `reply_reject:${confirmationId}` },
        ],
      ],
    },
  };
}

function formatConfirmationForSlack(
  event: SocialEngagementEvent,
  replyContent: string,
  confirmationId: string
): {
  text: string;
  blocks: unknown[];
} {
  const authorDisplay = event.author_display_name || event.author_username || "Unknown";

  return {
    text: "📤 Reply Confirmation Required",
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "📤 Reply Confirmation Required", emoji: true },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Your reply:*\n${replyContent}` },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Replying to:*\n${authorDisplay} on ${event.source_platform}` },
          { type: "mrkdwn", text: `*Original:*\n<${event.source_post_url ?? "#"}|View post>` },
        ],
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: "_This will be posted publicly. Expires in 24 hours._" },
        ],
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "✅ Approve & Send", emoji: true },
            style: "primary",
            action_id: `reply_confirm`,
            value: confirmationId,
          },
          {
            type: "button",
            text: { type: "plain_text", text: "❌ Reject", emoji: true },
            style: "danger",
            action_id: `reply_reject`,
            value: confirmationId,
          },
        ],
      },
    ],
  };
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

class ReplyRouterService {
  async processIncomingReply(reply: IncomingReply): Promise<ConfirmationPromptResult | null> {
    logger.info("[ReplyRouter] Processing incoming reply", {
      platform: reply.platform,
      channelId: reply.channelId,
      replyToMessageId: reply.replyToMessageId,
    });

    const result = await notificationMessageService.findEngagementByMessage(
      reply.platform,
      reply.channelId,
      reply.replyToMessageId
    );

    if (!result) {
      logger.debug("[ReplyRouter] No matching notification found", {
        platform: reply.platform,
        messageId: reply.replyToMessageId,
      });
      return null;
    }

    const { event } = result;

    // Get the feed config to determine target platform
    const config = await feedConfigService.get(event.feed_config_id, event.organization_id);
    if (!config) {
      logger.warn("[ReplyRouter] Feed config not found", { feedConfigId: event.feed_config_id });
      return null;
    }

    // Create pending confirmation
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const confirmation = await replyConfirmationService.create({
      organizationId: event.organization_id,
      engagementEventId: event.id,
      targetPlatform: event.source_platform,
      targetPostId: event.source_post_id,
      targetPostUrl: event.source_post_url ?? undefined,
      sourcePlatform: reply.platform,
      sourceChannelId: reply.channelId,
      sourceServerId: reply.serverId,
      sourceMessageId: reply.messageId,
      sourceUserId: reply.userId,
      sourceUsername: reply.username,
      sourceUserDisplayName: reply.displayName,
      replyContent: reply.content,
      replyMediaUrls: reply.mediaUrls,
      expiresAt,
    });

    const promptResult = await this.sendConfirmationPrompt(
      reply.platform,
      reply.channelId,
      reply.serverId,
      event,
      reply.content,
      confirmation.id,
      event.organization_id
    );

    if (promptResult.success && promptResult.messageId) {
      await replyConfirmationService.setConfirmationMessage(
        confirmation.id,
        promptResult.messageId,
        reply.channelId
      );
    }

    return {
      success: promptResult.success,
      confirmationId: confirmation.id,
      promptMessageId: promptResult.messageId,
      error: promptResult.error,
    };
  }

  private async sendConfirmationPrompt(
    platform: string,
    channelId: string,
    serverId: string | undefined,
    event: SocialEngagementEvent,
    replyContent: string,
    confirmationId: string,
    organizationId: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      switch (platform) {
        case "discord":
          return await this.sendDiscordConfirmation(
            channelId,
            event,
            replyContent,
            confirmationId,
            organizationId
          );
        case "telegram":
          return await this.sendTelegramConfirmation(
            channelId,
            event,
            replyContent,
            confirmationId,
            organizationId
          );
        case "slack":
          return await this.sendSlackConfirmation(
            channelId,
            event,
            replyContent,
            confirmationId,
            organizationId
          );
        default:
          return { success: false, error: `Unsupported platform: ${platform}` };
      }
    } catch (error) {
      logger.error("[ReplyRouter] Failed to send confirmation prompt", { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private async sendDiscordConfirmation(
    channelId: string,
    event: SocialEngagementEvent,
    replyContent: string,
    confirmationId: string,
    organizationId: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const connections = await botsService.getConnections(organizationId);
    const discordConnection = connections.find(
      (c) => c.platform === "discord" && c.status === "active"
    );

    if (!discordConnection) {
      return { success: false, error: "No active Discord connection" };
    }

    const botToken = await botsService.getBotToken(discordConnection.id, organizationId);
    const payload = formatConfirmationForDiscord(event, replyContent, confirmationId);

    const response = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
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
      return { success: false, error: `Discord API error: ${error}` };
    }

    const message = await response.json();
    return { success: true, messageId: message.id };
  }

  private async sendTelegramConfirmation(
    chatId: string,
    event: SocialEngagementEvent,
    replyContent: string,
    confirmationId: string,
    organizationId: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const connections = await botsService.getConnections(organizationId);
    const telegramConnection = connections.find(
      (c) => c.platform === "telegram" && c.status === "active"
    );

    if (!telegramConnection) {
      return { success: false, error: "No active Telegram connection" };
    }

    const payload = formatConfirmationForTelegram(event, replyContent, confirmationId);

    const message = await telegramService.sendMessageViaConnection(
      telegramConnection.id,
      organizationId,
      chatId,
      payload.text,
      {
        parse_mode: "HTML",
        reply_markup: payload.replyMarkup,
      }
    );

    return { success: true, messageId: String(message.message_id) };
  }

  private async sendSlackConfirmation(
    channelId: string,
    event: SocialEngagementEvent,
    replyContent: string,
    confirmationId: string,
    organizationId: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const botToken = await secretsService.get(organizationId, "SLACK_BOT_TOKEN");

    if (!botToken) {
      return { success: false, error: "No Slack bot token configured" };
    }

    const payload = formatConfirmationForSlack(event, replyContent, confirmationId);

    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${botToken}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        channel: channelId,
        ...payload,
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      return { success: false, error: data.error ?? "Slack API error" };
    }

    return { success: true, messageId: data.ts };
  }

  async handleConfirmation(
    confirmationId: string,
    organizationId: string,
    confirmedByUserId: string,
    confirmedByUsername?: string
  ): Promise<ReplyPostResult> {
    logger.info("[ReplyRouter] Processing confirmation", { confirmationId });

    const confirmation = await replyConfirmationService.confirm(
      confirmationId,
      organizationId,
      confirmedByUserId,
      confirmedByUsername
    );

    return this.postReplyToExternalPlatform(confirmation);
  }

  async handleRejection(
    confirmationId: string,
    organizationId: string,
    rejectedByUserId: string,
    reason?: string
  ): Promise<void> {
    logger.info("[ReplyRouter] Processing rejection", { confirmationId });

    await replyConfirmationService.reject(confirmationId, organizationId, rejectedByUserId, reason);
    await this.sendRejectionFeedback(confirmationId, organizationId);
  }

  private async postReplyToExternalPlatform(
    confirmation: PendingReplyConfirmation
  ): Promise<ReplyPostResult> {
    logger.info("[ReplyRouter] Posting reply to external platform", {
      confirmationId: confirmation.id,
      platform: confirmation.target_platform,
      postId: confirmation.target_post_id,
    });

    const content: PostContent = {
      text: confirmation.reply_content,
      replyToId: confirmation.target_post_id,
    };

    // Add media if present
    if (confirmation.reply_media_urls && confirmation.reply_media_urls.length > 0) {
      content.media = confirmation.reply_media_urls.map((url) => ({
        type: "image" as const,
        url,
        mimeType: "image/jpeg",
      }));
    }

    const result = await socialMediaService.replyToPost(
      confirmation.organization_id,
      confirmation.target_platform as SocialPlatform,
      confirmation.target_post_id,
      content
    );

    if (result.success) {
      await replyConfirmationService.markSent(confirmation.id, result.postId!, result.postUrl);
      await this.sendSuccessFeedback(confirmation, result.postUrl);
      return { success: true, postId: result.postId, postUrl: result.postUrl };
    }

    await replyConfirmationService.markFailed(confirmation.id, result.error ?? "Unknown error");
    return { success: false, error: result.error };
  }

  private async sendSuccessFeedback(confirmation: PendingReplyConfirmation, postUrl?: string): Promise<void> {
    const message = postUrl ? `✅ Reply posted!\n\n${postUrl}` : "✅ Reply posted!";
    await this.sendFeedbackMessage(confirmation, message);
  }

  private async sendRejectionFeedback(confirmationId: string, organizationId: string): Promise<void> {
    const confirmation = await replyConfirmationService.get(confirmationId, organizationId);
    if (!confirmation) return;

    const reason = confirmation.rejection_reason ? `\nReason: ${confirmation.rejection_reason}` : "";
    await this.sendFeedbackMessage(confirmation, `❌ Reply not sent.${reason}`);
  }

  private async sendFeedbackMessage(
    confirmation: PendingReplyConfirmation,
    message: string
  ): Promise<void> {
    try {
      const organizationId = confirmation.organization_id;

      switch (confirmation.source_platform) {
        case "discord": {
          const connections = await botsService.getConnections(organizationId);
          const discordConnection = connections.find(
            (c) => c.platform === "discord" && c.status === "active"
          );
          if (!discordConnection) return;

          const botToken = await botsService.getBotToken(discordConnection.id, organizationId);

          await fetch(
            `https://discord.com/api/v10/channels/${confirmation.source_channel_id}/messages`,
            {
              method: "POST",
              headers: {
                Authorization: `Bot ${botToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                content: message,
                message_reference: {
                  message_id: confirmation.confirmation_message_id,
                },
              }),
            }
          );
          break;
        }
        case "telegram": {
          const connections = await botsService.getConnections(organizationId);
          const telegramConnection = connections.find(
            (c) => c.platform === "telegram" && c.status === "active"
          );
          if (!telegramConnection) return;

          await telegramService.sendMessageViaConnection(
            telegramConnection.id,
            organizationId,
            confirmation.source_channel_id,
            message,
            {
              reply_to_message_id: confirmation.confirmation_message_id
                ? parseInt(confirmation.confirmation_message_id)
                : undefined,
            }
          );
          break;
        }
        case "slack": {
          const botToken = await secretsService.get(organizationId, "SLACK_BOT_TOKEN");
          if (!botToken) return;

          await fetch("https://slack.com/api/chat.postMessage", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${botToken}`,
              "Content-Type": "application/json; charset=utf-8",
            },
            body: JSON.stringify({
              channel: confirmation.source_channel_id,
              text: message,
              thread_ts: confirmation.confirmation_message_id,
            }),
          });
          break;
        }
      }
    } catch (error) {
      logger.error("[ReplyRouter] Failed to send feedback message", { error });
    }
  }

  async processExpiredConfirmations(): Promise<number> {
    const expired = await replyConfirmationService.getPendingForExpiry(100);

    for (const confirmation of expired) {
      await this.sendFeedbackMessage(
        confirmation,
        "⏰ Reply confirmation expired. The reply was not sent."
      );
    }

    return replyConfirmationService.expirePending();
  }
}

export const replyRouterService = new ReplyRouterService();

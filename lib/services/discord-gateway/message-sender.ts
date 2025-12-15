import { logger } from "@/lib/utils/logger";
import { DISCORD_API_BASE, discordBotHeaders } from "@/lib/utils/discord-api";
import { discordGatewayService } from "./gateway-service";
import { discordStateManager } from "./state-manager";
import type {
  SendMessageRequest,
  SendMessageResult,
  DiscordMessage,
  DiscordEmbed,
} from "./types";

export class DiscordMessageSender {
  private static instance: DiscordMessageSender;

  private constructor() {}

  static getInstance(): DiscordMessageSender {
    if (!DiscordMessageSender.instance) {
      DiscordMessageSender.instance = new DiscordMessageSender();
    }
    return DiscordMessageSender.instance;
  }

  async sendMessage(
    connectionId: string,
    request: SendMessageRequest,
  ): Promise<SendMessageResult> {
    const token = await discordGatewayService.getBotToken(connectionId);
    if (!token) {
      return { success: false, error: "Bot token not found" };
    }

    // Check rate limit
    const rateLimit = await discordStateManager.checkRateLimit(
      connectionId,
      `channel:${request.channelId}:messages`,
      5, // 5 messages
      5000, // per 5 seconds
    );

    if (!rateLimit.allowed) {
      logger.warn("[Discord Message Sender] Rate limited", {
        connectionId,
        channelId: request.channelId,
        resetAt: new Date(rateLimit.resetAt).toISOString(),
      });
      return { success: false, error: "Rate limited" };
    }

    // Build message payload
    const payload: Record<string, unknown> = {};

    if (request.content) {
      payload.content = request.content;
    }

    if (request.embeds && request.embeds.length > 0) {
      payload.embeds = request.embeds;
    }

    if (request.replyTo) {
      payload.message_reference = {
        message_id: request.replyTo,
      };
    }

    if (request.allowedMentions) {
      payload.allowed_mentions = {
        parse: request.allowedMentions.parse,
        roles: request.allowedMentions.roles,
        users: request.allowedMentions.users,
        replied_user: request.allowedMentions.repliedUser,
      };
    }

    const response = await fetch(
      `${DISCORD_API_BASE}/channels/${request.channelId}/messages`,
      {
        method: "POST",
        headers: discordBotHeaders(token),
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      logger.error("[Discord Message Sender] Failed to send message", {
        connectionId,
        channelId: request.channelId,
        status: response.status,
        error,
      });
      return { success: false, error: `Discord API error: ${response.status}` };
    }

    const message: DiscordMessage = await response.json();

    logger.info("[Discord Message Sender] Message sent", {
      connectionId,
      channelId: request.channelId,
      messageId: message.id,
    });

    return {
      success: true,
      messageId: message.id,
      channelId: message.channel_id,
    };
  }

  async editMessage(
    connectionId: string,
    channelId: string,
    messageId: string,
    content?: string,
    embeds?: DiscordEmbed[],
  ): Promise<SendMessageResult> {
    const token = await discordGatewayService.getBotToken(connectionId);
    if (!token) {
      return { success: false, error: "Bot token not found" };
    }

    const payload: Record<string, unknown> = {};
    if (content !== undefined) payload.content = content;
    if (embeds) payload.embeds = embeds;

    const response = await fetch(
      `${DISCORD_API_BASE}/channels/${channelId}/messages/${messageId}`,
      {
        method: "PATCH",
        headers: discordBotHeaders(token),
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      return { success: false, error: `Discord API error: ${response.status}` };
    }

    const message: DiscordMessage = await response.json();
    return {
      success: true,
      messageId: message.id,
      channelId: message.channel_id,
    };
  }

  async deleteMessage(
    connectionId: string,
    channelId: string,
    messageId: string,
  ): Promise<boolean> {
    const token = await discordGatewayService.getBotToken(connectionId);
    if (!token) {
      logger.warn("[Discord Message Sender] Delete message failed - no token", {
        connectionId,
        channelId,
        messageId,
      });
      return false;
    }

    const response = await fetch(
      `${DISCORD_API_BASE}/channels/${channelId}/messages/${messageId}`,
      {
        method: "DELETE",
        headers: discordBotHeaders(token),
      },
    );

    if (!response.ok) {
      logger.warn("[Discord Message Sender] Delete message failed", {
        connectionId,
        channelId,
        messageId,
        status: response.status,
      });
    }
    return response.ok;
  }

  async addReaction(
    connectionId: string,
    channelId: string,
    messageId: string,
    emoji: string,
  ): Promise<boolean> {
    const token = await discordGatewayService.getBotToken(connectionId);
    if (!token) {
      logger.warn("[Discord Message Sender] Add reaction failed - no token", {
        connectionId,
        channelId,
        messageId,
        emoji,
      });
      return false;
    }

    const encodedEmoji = encodeURIComponent(emoji);

    const response = await fetch(
      `${DISCORD_API_BASE}/channels/${channelId}/messages/${messageId}/reactions/${encodedEmoji}/@me`,
      {
        method: "PUT",
        headers: discordBotHeaders(token),
      },
    );

    if (!response.ok) {
      logger.warn("[Discord Message Sender] Add reaction failed", {
        connectionId,
        channelId,
        messageId,
        emoji,
        status: response.status,
      });
    }
    return response.ok;
  }

  async removeReaction(
    connectionId: string,
    channelId: string,
    messageId: string,
    emoji: string,
    userId?: string,
  ): Promise<boolean> {
    const token = await discordGatewayService.getBotToken(connectionId);
    if (!token) {
      logger.warn(
        "[Discord Message Sender] Remove reaction failed - no token",
        { connectionId, channelId, messageId, emoji },
      );
      return false;
    }

    const encodedEmoji = encodeURIComponent(emoji);
    const target = userId ?? "@me";

    const response = await fetch(
      `${DISCORD_API_BASE}/channels/${channelId}/messages/${messageId}/reactions/${encodedEmoji}/${target}`,
      {
        method: "DELETE",
        headers: discordBotHeaders(token),
      },
    );

    if (!response.ok) {
      logger.warn("[Discord Message Sender] Remove reaction failed", {
        connectionId,
        channelId,
        messageId,
        emoji,
        status: response.status,
      });
    }
    return response.ok;
  }

  async startTyping(connectionId: string, channelId: string): Promise<boolean> {
    const token = await discordGatewayService.getBotToken(connectionId);
    if (!token) {
      logger.debug("[Discord Message Sender] Start typing failed - no token", {
        connectionId,
        channelId,
      });
      return false;
    }

    const response = await fetch(
      `${DISCORD_API_BASE}/channels/${channelId}/typing`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${token}`,
        },
      },
    );

    if (!response.ok) {
      logger.debug("[Discord Message Sender] Start typing failed", {
        connectionId,
        channelId,
        status: response.status,
      });
    }
    return response.ok;
  }

  async createThread(
    connectionId: string,
    channelId: string,
    messageId: string,
    name: string,
    autoArchiveDuration?: 60 | 1440 | 4320 | 10080,
  ): Promise<{ success: boolean; threadId?: string; error?: string }> {
    const token = await discordGatewayService.getBotToken(connectionId);
    if (!token) {
      return { success: false, error: "Bot token not found" };
    }

    const response = await fetch(
      `${DISCORD_API_BASE}/channels/${channelId}/messages/${messageId}/threads`,
      {
        method: "POST",
        headers: discordBotHeaders(token),
        body: JSON.stringify({
          name: name.slice(0, 100), // Thread name limit
          auto_archive_duration: autoArchiveDuration ?? 1440,
        }),
      },
    );

    if (!response.ok) {
      return { success: false, error: `Discord API error: ${response.status}` };
    }

    const thread: { id: string } = await response.json();
    return { success: true, threadId: thread.id };
  }

  async getChannel(
    connectionId: string,
    channelId: string,
  ): Promise<{ id: string; name?: string; type: number } | null> {
    const token = await discordGatewayService.getBotToken(connectionId);
    if (!token) return null;

    const response = await fetch(`${DISCORD_API_BASE}/channels/${channelId}`, {
      headers: discordBotHeaders(token),
    });

    if (!response.ok) return null;

    return await response.json();
  }

  async getMessages(
    connectionId: string,
    channelId: string,
    options?: {
      limit?: number;
      before?: string;
      after?: string;
      around?: string;
    },
  ): Promise<DiscordMessage[]> {
    const token = await discordGatewayService.getBotToken(connectionId);
    if (!token) return [];

    const params = new URLSearchParams();
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.before) params.set("before", options.before);
    if (options?.after) params.set("after", options.after);
    if (options?.around) params.set("around", options.around);

    const url = `${DISCORD_API_BASE}/channels/${channelId}/messages?${params}`;

    const response = await fetch(url, {
      headers: discordBotHeaders(token),
    });

    if (!response.ok) return [];

    return await response.json();
  }

  async getMessage(
    connectionId: string,
    channelId: string,
    messageId: string,
  ): Promise<DiscordMessage | null> {
    const token = await discordGatewayService.getBotToken(connectionId);
    if (!token) return null;

    const response = await fetch(
      `${DISCORD_API_BASE}/channels/${channelId}/messages/${messageId}`,
      {
        headers: discordBotHeaders(token),
      },
    );

    if (!response.ok) return null;

    return await response.json();
  }

  async getGuildMember(
    connectionId: string,
    guildId: string,
    userId: string,
  ): Promise<{
    user?: { id: string; username: string };
    nick?: string;
    roles: string[];
  } | null> {
    const token = await discordGatewayService.getBotToken(connectionId);
    if (!token) return null;

    const response = await fetch(
      `${DISCORD_API_BASE}/guilds/${guildId}/members/${userId}`,
      {
        headers: discordBotHeaders(token),
      },
    );

    if (!response.ok) return null;

    return await response.json();
  }

  async addRole(
    connectionId: string,
    guildId: string,
    userId: string,
    roleId: string,
    reason?: string,
  ): Promise<{ success: boolean; error?: string }> {
    const token = await discordGatewayService.getBotToken(connectionId);
    if (!token) {
      return { success: false, error: "Bot token not found" };
    }

    const headers = discordBotHeaders(
      token,
      reason
        ? { "X-Audit-Log-Reason": encodeURIComponent(reason.slice(0, 512)) }
        : undefined,
    );

    const response = await fetch(
      `${DISCORD_API_BASE}/guilds/${guildId}/members/${userId}/roles/${roleId}`,
      {
        method: "PUT",
        headers,
      },
    );

    if (!response.ok) {
      const error = await response.text();
      logger.error("[Discord] Add role failed", {
        guildId,
        userId,
        roleId,
        error,
      });
      return { success: false, error: `Discord API error: ${response.status}` };
    }

    logger.info("[Discord] Role added", { guildId, userId, roleId });
    return { success: true };
  }

  async removeRole(
    connectionId: string,
    guildId: string,
    userId: string,
    roleId: string,
    reason?: string,
  ): Promise<{ success: boolean; error?: string }> {
    const token = await discordGatewayService.getBotToken(connectionId);
    if (!token) {
      return { success: false, error: "Bot token not found" };
    }

    const headers = discordBotHeaders(
      token,
      reason
        ? { "X-Audit-Log-Reason": encodeURIComponent(reason.slice(0, 512)) }
        : undefined,
    );

    const response = await fetch(
      `${DISCORD_API_BASE}/guilds/${guildId}/members/${userId}/roles/${roleId}`,
      {
        method: "DELETE",
        headers,
      },
    );

    if (!response.ok) {
      const error = await response.text();
      logger.error("[Discord] Remove role failed", {
        guildId,
        userId,
        roleId,
        error,
      });
      return { success: false, error: `Discord API error: ${response.status}` };
    }

    logger.info("[Discord] Role removed", { guildId, userId, roleId });
    return { success: true };
  }

  async getGuildRoles(
    connectionId: string,
    guildId: string,
  ): Promise<
    Array<{ id: string; name: string; color: number; position: number }>
  > {
    const token = await discordGatewayService.getBotToken(connectionId);
    if (!token) return [];

    const response = await fetch(
      `${DISCORD_API_BASE}/guilds/${guildId}/roles`,
      {
        headers: discordBotHeaders(token),
      },
    );

    if (!response.ok) return [];

    return await response.json();
  }

  async timeoutMember(
    connectionId: string,
    guildId: string,
    userId: string,
    durationSeconds: number,
    reason?: string,
  ): Promise<{ success: boolean; error?: string }> {
    const token = await discordGatewayService.getBotToken(connectionId);
    if (!token) {
      return { success: false, error: "Bot token not found" };
    }

    // Calculate timeout end time (max 28 days)
    const maxDuration = 28 * 24 * 60 * 60;
    const actualDuration = Math.min(durationSeconds, maxDuration);
    const timeoutUntil = new Date(
      Date.now() + actualDuration * 1000,
    ).toISOString();

    const headers = discordBotHeaders(
      token,
      reason
        ? { "X-Audit-Log-Reason": encodeURIComponent(reason.slice(0, 512)) }
        : undefined,
    );

    const response = await fetch(
      `${DISCORD_API_BASE}/guilds/${guildId}/members/${userId}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          communication_disabled_until: timeoutUntil,
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      logger.error("[Discord] Timeout failed", { guildId, userId, error });
      return { success: false, error: `Discord API error: ${response.status}` };
    }

    logger.info("[Discord] Member timed out", {
      guildId,
      userId,
      durationSeconds: actualDuration,
    });
    return { success: true };
  }

  async removeTimeout(
    connectionId: string,
    guildId: string,
    userId: string,
    reason?: string,
  ): Promise<{ success: boolean; error?: string }> {
    const token = await discordGatewayService.getBotToken(connectionId);
    if (!token) {
      return { success: false, error: "Bot token not found" };
    }

    const headers = discordBotHeaders(
      token,
      reason
        ? { "X-Audit-Log-Reason": encodeURIComponent(reason.slice(0, 512)) }
        : undefined,
    );

    const response = await fetch(
      `${DISCORD_API_BASE}/guilds/${guildId}/members/${userId}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          communication_disabled_until: null,
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      logger.error("[Discord] Remove timeout failed", {
        guildId,
        userId,
        error,
      });
      return { success: false, error: `Discord API error: ${response.status}` };
    }

    logger.info("[Discord] Timeout removed", { guildId, userId });
    return { success: true };
  }

  async kickMember(
    connectionId: string,
    guildId: string,
    userId: string,
    reason?: string,
  ): Promise<{ success: boolean; error?: string }> {
    const token = await discordGatewayService.getBotToken(connectionId);
    if (!token) {
      return { success: false, error: "Bot token not found" };
    }

    const headers = discordBotHeaders(
      token,
      reason
        ? { "X-Audit-Log-Reason": encodeURIComponent(reason.slice(0, 512)) }
        : undefined,
    );

    const response = await fetch(
      `${DISCORD_API_BASE}/guilds/${guildId}/members/${userId}`,
      {
        method: "DELETE",
        headers,
      },
    );

    if (!response.ok) {
      const error = await response.text();
      logger.error("[Discord] Kick failed", { guildId, userId, error });
      return { success: false, error: `Discord API error: ${response.status}` };
    }

    logger.info("[Discord] Member kicked", { guildId, userId });
    return { success: true };
  }

  async banMember(
    connectionId: string,
    guildId: string,
    userId: string,
    reason?: string,
    deleteMessageSeconds?: number,
  ): Promise<{ success: boolean; error?: string }> {
    const token = await discordGatewayService.getBotToken(connectionId);
    if (!token) {
      return { success: false, error: "Bot token not found" };
    }

    const headers = discordBotHeaders(
      token,
      reason
        ? { "X-Audit-Log-Reason": encodeURIComponent(reason.slice(0, 512)) }
        : undefined,
    );

    const body: Record<string, number> = {};
    if (deleteMessageSeconds !== undefined) {
      body.delete_message_seconds = Math.min(deleteMessageSeconds, 604800);
    }

    const response = await fetch(
      `${DISCORD_API_BASE}/guilds/${guildId}/bans/${userId}`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      logger.error("[Discord] Ban failed", { guildId, userId, error });
      return { success: false, error: `Discord API error: ${response.status}` };
    }

    logger.info("[Discord] Member banned", { guildId, userId });
    return { success: true };
  }

  async unbanMember(
    connectionId: string,
    guildId: string,
    userId: string,
    reason?: string,
  ): Promise<{ success: boolean; error?: string }> {
    const token = await discordGatewayService.getBotToken(connectionId);
    if (!token) {
      return { success: false, error: "Bot token not found" };
    }

    const headers = discordBotHeaders(
      token,
      reason
        ? { "X-Audit-Log-Reason": encodeURIComponent(reason.slice(0, 512)) }
        : undefined,
    );

    const response = await fetch(
      `${DISCORD_API_BASE}/guilds/${guildId}/bans/${userId}`,
      {
        method: "DELETE",
        headers,
      },
    );

    if (!response.ok) {
      const error = await response.text();
      logger.error("[Discord] Unban failed", { guildId, userId, error });
      return { success: false, error: `Discord API error: ${response.status}` };
    }

    logger.info("[Discord] Member unbanned", { guildId, userId });
    return { success: true };
  }

  async sendDM(
    connectionId: string,
    userId: string,
    content: string,
    embeds?: DiscordEmbed[],
  ): Promise<SendMessageResult> {
    const token = await discordGatewayService.getBotToken(connectionId);
    if (!token) {
      return { success: false, error: "Bot token not found" };
    }

    // Create DM channel
    const dmResponse = await fetch(`${DISCORD_API_BASE}/users/@me/channels`, {
      method: "POST",
      headers: discordBotHeaders(token),
      body: JSON.stringify({ recipient_id: userId }),
    });

    if (!dmResponse.ok) {
      const error = await dmResponse.text();
      logger.error("[Discord] Create DM failed", { userId, error });
      return { success: false, error: "Failed to create DM channel" };
    }

    const dmChannel: { id: string } = await dmResponse.json();
    return this.sendMessage(connectionId, {
      channelId: dmChannel.id,
      content,
      embeds,
    });
  }
}

export const discordMessageSender = DiscordMessageSender.getInstance();

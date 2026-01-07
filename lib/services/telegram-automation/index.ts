/**
 * Telegram Automation Service
 *
 * Handles bot token validation, credential storage, and webhook management
 * for Telegram bot integration. Uses Telegraf library directly.
 */

import { Telegraf } from "telegraf";
import { secretsService } from "@/lib/services/secrets";
import { logger } from "@/lib/utils/logger";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://eliza.gg";

export interface TelegramBotInfo {
  botId: number;
  botUsername: string;
  firstName: string;
  canJoinGroups: boolean;
  canReadAllGroupMessages: boolean;
}

export interface TelegramConnectionStatus {
  connected: boolean;
  configured: boolean;
  botUsername?: string;
  botId?: number;
  error?: string;
}

export interface TelegramCredentials {
  botToken: string;
  botUsername: string;
  botId: number;
}

class TelegramAutomationService {
  /**
   * Validate a bot token by calling Telegram's getMe API.
   */
  async validateBotToken(token: string): Promise<{
    valid: boolean;
    botInfo?: TelegramBotInfo;
    error?: string;
  }> {
    if (!token || !token.includes(":")) {
      return { valid: false, error: "Invalid token format" };
    }

    try {
      const bot = new Telegraf(token);
      const me = await bot.telegram.getMe();

      logger.info("[TelegramAutomation] Token validated successfully", {
        botId: me.id,
        botUsername: me.username,
      });

      return {
        valid: true,
        botInfo: {
          botId: me.id,
          botUsername: me.username || `bot${me.id}`,
          firstName: me.first_name,
          canJoinGroups: me.can_join_groups || false,
          canReadAllGroupMessages: me.can_read_all_group_messages || false,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.warn("[TelegramAutomation] Token validation failed", { error: message });
      return { valid: false, error: message };
    }
  }

  /**
   * Store bot credentials in the secrets service.
   */
  async storeCredentials(
    organizationId: string,
    userId: string,
    credentials: TelegramCredentials,
  ): Promise<void> {
    const audit = {
      actorType: "user" as const,
      actorId: userId,
      source: "telegram-automation",
    };

    await secretsService.create(
      {
        organizationId,
        name: "TELEGRAM_BOT_TOKEN",
        value: credentials.botToken,
        scope: "organization",
        createdBy: userId,
      },
      audit,
    );

    await secretsService.create(
      {
        organizationId,
        name: "TELEGRAM_BOT_USERNAME",
        value: credentials.botUsername,
        scope: "organization",
        createdBy: userId,
      },
      audit,
    );

    await secretsService.create(
      {
        organizationId,
        name: "TELEGRAM_BOT_ID",
        value: String(credentials.botId),
        scope: "organization",
        createdBy: userId,
      },
      audit,
    );

    logger.info("[TelegramAutomation] Credentials stored", {
      organizationId,
      botUsername: credentials.botUsername,
    });
  }

  /**
   * Remove bot credentials (disconnect).
   */
  async removeCredentials(organizationId: string, userId: string): Promise<void> {
    const audit = {
      actorType: "user" as const,
      actorId: userId,
      source: "telegram-automation",
    };

    try {
      await this.removeWebhook(organizationId);
    } catch {
      // Webhook might not be set
    }

    const secretNames = [
      "TELEGRAM_BOT_TOKEN",
      "TELEGRAM_BOT_USERNAME",
      "TELEGRAM_BOT_ID",
    ];

    await Promise.all(
      secretNames.map((name) =>
        secretsService.delete({ organizationId, name }, audit).catch(() => {}),
      ),
    );

    logger.info("[TelegramAutomation] Credentials removed", { organizationId });
  }

  /**
   * Get bot token for an organization.
   */
  async getBotToken(organizationId: string): Promise<string | null> {
    return secretsService.get(organizationId, "TELEGRAM_BOT_TOKEN");
  }

  /**
   * Get connection status for an organization.
   */
  async getConnectionStatus(organizationId: string): Promise<TelegramConnectionStatus> {
    const [botToken, botUsername, botId] = await Promise.all([
      secretsService.get(organizationId, "TELEGRAM_BOT_TOKEN"),
      secretsService.get(organizationId, "TELEGRAM_BOT_USERNAME"),
      secretsService.get(organizationId, "TELEGRAM_BOT_ID"),
    ]);

    if (!botToken) {
      return { connected: false, configured: false };
    }

    try {
      const bot = new Telegraf(botToken);
      const me = await bot.telegram.getMe();

      return {
        connected: true,
        configured: true,
        botUsername: me.username || botUsername || undefined,
        botId: me.id,
      };
    } catch (error) {
      logger.warn("[TelegramAutomation] Token validation failed during status check", {
        organizationId,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      // Return stored data even if validation fails
      return {
        connected: true,
        configured: true,
        botUsername: botUsername || undefined,
        botId: botId ? parseInt(botId, 10) : undefined,
        error: "Token may be invalid. Try reconnecting.",
      };
    }
  }

  /**
   * Set webhook for receiving updates from Telegram.
   */
  async setWebhook(organizationId: string): Promise<{ success: boolean; error?: string }> {
    const botToken = await this.getBotToken(organizationId);
    if (!botToken) {
      return { success: false, error: "Bot token not found" };
    }

    try {
      const bot = new Telegraf(botToken);
      const webhookUrl = `${APP_URL}/api/v1/telegram/webhook/${organizationId}`;

      await bot.telegram.setWebhook(webhookUrl, {
        allowed_updates: ["message", "callback_query", "channel_post", "my_chat_member"],
        drop_pending_updates: true,
      });

      logger.info("[TelegramAutomation] Webhook set", {
        organizationId,
        webhookUrl,
      });

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("[TelegramAutomation] Failed to set webhook", {
        organizationId,
        error: message,
      });
      return { success: false, error: message };
    }
  }

  /**
   * Remove webhook for an organization.
   */
  async removeWebhook(organizationId: string): Promise<void> {
    const botToken = await this.getBotToken(organizationId);
    if (!botToken) return;

    try {
      const bot = new Telegraf(botToken);
      await bot.telegram.deleteWebhook({ drop_pending_updates: true });

      logger.info("[TelegramAutomation] Webhook removed", { organizationId });
    } catch (error) {
      logger.warn("[TelegramAutomation] Failed to remove webhook", {
        organizationId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Get a Telegraf bot instance for an organization.
   */
  async getBotInstance(organizationId: string): Promise<Telegraf | null> {
    const botToken = await this.getBotToken(organizationId);
    if (!botToken) return null;
    return new Telegraf(botToken);
  }

  /**
   * Send a message to a chat.
   */
  async sendMessage(
    organizationId: string,
    chatId: string | number,
    text: string,
    options?: {
      parseMode?: "MarkdownV2" | "HTML";
      replyMarkup?: {
        inline_keyboard: Array<
          Array<{ text: string; url?: string; callback_data?: string }>
        >;
      };
      disableWebPagePreview?: boolean;
    },
  ): Promise<{ success: boolean; messageId?: number; error?: string }> {
    const bot = await this.getBotInstance(organizationId);
    if (!bot) {
      return { success: false, error: "Bot not configured" };
    }

    try {
      const result = await bot.telegram.sendMessage(chatId, text, {
        parse_mode: options?.parseMode,
        reply_markup: options?.replyMarkup,
        link_preview_options: options?.disableWebPagePreview
          ? { is_disabled: true }
          : undefined,
      });

      return { success: true, messageId: result.message_id };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("[TelegramAutomation] Failed to send message", {
        organizationId,
        chatId,
        error: message,
      });
      return { success: false, error: message };
    }
  }

  /**
   * Check if Telegram is configured (has stored credentials).
   */
  async isConfigured(organizationId: string): Promise<boolean> {
    const token = await this.getBotToken(organizationId);
    return Boolean(token);
  }
}

export const telegramAutomationService = new TelegramAutomationService();

// Re-export app automation service
export {
  telegramAppAutomationService,
  type TelegramAutomationConfig,
} from "./app-automation";

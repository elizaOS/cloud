/**
 * Telegram App Automation Service
 *
 * Handles app-specific Telegram automation including AI-powered
 * message generation and automated announcements.
 */

import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { Telegraf } from "telegraf";
import { telegramAutomationService } from "./index";
import { appsRepository } from "@/db/repositories/apps";
import { logger } from "@/lib/utils/logger";
import {
  splitMessage,
  createInlineKeyboard,
  TELEGRAM_RATE_LIMITS,
} from "@/lib/utils/telegram-helpers";
import type { App } from "@/db/schemas/apps";

export interface TelegramAutomationConfig {
  enabled?: boolean;
  botUsername?: string;
  channelId?: string;
  groupId?: string;
  autoReply?: boolean;
  autoAnnounce?: boolean;
  announceIntervalMin?: number;
  announceIntervalMax?: number;
  welcomeMessage?: string;
  vibeStyle?: string;
}

export interface TelegramAutomationStatus {
  enabled: boolean;
  botConnected: boolean;
  botUsername?: string;
  channelId?: string;
  groupId?: string;
  autoReply: boolean;
  autoAnnounce: boolean;
  lastAnnouncementAt?: string;
  totalMessages: number;
}

export interface PostResult {
  success: boolean;
  messageId?: number;
  chatId?: string | number;
  error?: string;
}

class TelegramAppAutomationService {
  /**
   * Get app for organization, checking ownership.
   */
  private async getAppForOrg(organizationId: string, appId: string): Promise<App> {
    const app = await appsRepository.findById(appId);
    if (!app || app.organization_id !== organizationId) {
      throw new Error("App not found");
    }
    return app;
  }

  /**
   * Enable or update automation for an app.
   */
  async enableAutomation(
    organizationId: string,
    appId: string,
    config: TelegramAutomationConfig,
  ): Promise<App> {
    const app = await this.getAppForOrg(organizationId, appId);

    const isConnected = await telegramAutomationService.isConfigured(organizationId);
    if (!isConnected) {
      throw new Error("Telegram bot not connected. Connect a bot in Settings first.");
    }

    const currentConfig = app.telegram_automation || {
      enabled: false,
      autoReply: true,
      autoAnnounce: false,
      announceIntervalMin: 120,
      announceIntervalMax: 240,
    };

    const updatedConfig = {
      ...currentConfig,
      ...config,
      enabled: config.enabled ?? true,
    };

    const updatedApp = await appsRepository.update(appId, {
      telegram_automation: updatedConfig,
    });

    logger.info("[TelegramAppAutomation] Automation enabled", {
      appId,
      organizationId,
      config: updatedConfig,
    });

    return updatedApp;
  }

  /**
   * Disable automation for an app.
   */
  async disableAutomation(organizationId: string, appId: string): Promise<App> {
    const app = await this.getAppForOrg(organizationId, appId);

    const currentConfig = app.telegram_automation || {
      enabled: false,
      autoReply: true,
      autoAnnounce: false,
      announceIntervalMin: 120,
      announceIntervalMax: 240,
    };

    const updatedApp = await appsRepository.update(appId, {
      telegram_automation: {
        ...currentConfig,
        enabled: false,
      },
    });

    logger.info("[TelegramAppAutomation] Automation disabled", {
      appId,
      organizationId,
    });

    return updatedApp;
  }

  /**
   * Get automation status for an app.
   */
  async getAutomationStatus(
    organizationId: string,
    appId: string,
  ): Promise<TelegramAutomationStatus> {
    const app = await this.getAppForOrg(organizationId, appId);
    const connectionStatus = await telegramAutomationService.getConnectionStatus(
      organizationId,
    );

    const config = app.telegram_automation || {
      enabled: false,
      autoReply: true,
      autoAnnounce: false,
      announceIntervalMin: 120,
      announceIntervalMax: 240,
    };

    return {
      enabled: config.enabled,
      botConnected: connectionStatus.connected,
      botUsername: connectionStatus.botUsername || config.botUsername,
      channelId: config.channelId,
      groupId: config.groupId,
      autoReply: config.autoReply,
      autoAnnounce: config.autoAnnounce,
      lastAnnouncementAt: config.lastAnnouncementAt,
      totalMessages: config.totalMessages || 0,
    };
  }

  /**
   * Generate an AI announcement for an app.
   */
  async generateAnnouncement(app: App): Promise<string> {
    const config = app.telegram_automation;
    const vibeStyle = config?.vibeStyle || "professional and engaging";

    const systemPrompt = `You are creating a Telegram announcement for an app called "${app.name}".
The app is: ${app.description || "A great application"}
Website: ${app.website_url || app.app_url}

Write in a ${vibeStyle} style. Keep it concise and engaging.
Use appropriate emojis sparingly. Do not use hashtags excessively.
Maximum 500 characters.`;

    try {
      const result = await generateText({
        model: openai("gpt-4o-mini"),
        system: systemPrompt,
        prompt: "Create a compelling announcement about this app that would engage a Telegram community. Focus on what makes it unique and valuable.",
        maxTokens: 200,
      });

      return result.text;
    } catch (error) {
      logger.error("[TelegramAppAutomation] Failed to generate announcement", {
        appId: app.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      // Return a simple fallback message
      return `Check out ${app.name}! ${app.description || "A great application you should try."} ${app.website_url || app.app_url}`;
    }
  }

  /**
   * Generate an AI reply to a user message.
   */
  async generateReply(
    app: App,
    userMessage: string,
    userName?: string,
  ): Promise<string> {
    const config = app.telegram_automation;
    const vibeStyle = config?.vibeStyle || "helpful and friendly";

    const systemPrompt = `You are an AI assistant for "${app.name}" on Telegram.
App description: ${app.description || "A helpful application"}
Website: ${app.website_url || app.app_url}

Respond in a ${vibeStyle} style. Be helpful and concise.
If asked about features not related to the app, politely redirect to the app's purpose.
Maximum 300 characters.`;

    try {
      const result = await generateText({
        model: openai("gpt-4o-mini"),
        system: systemPrompt,
        prompt: userName
          ? `User ${userName} says: "${userMessage}"`
          : `User says: "${userMessage}"`,
        maxTokens: 150,
      });

      return result.text;
    } catch (error) {
      logger.error("[TelegramAppAutomation] Failed to generate reply", {
        appId: app.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      // Return a simple fallback message
      return `Thanks for reaching out! Visit ${app.website_url || app.app_url} to learn more about ${app.name}.`;
    }
  }

  /**
   * Post an announcement to a channel or group.
   */
  async postAnnouncement(
    organizationId: string,
    appId: string,
    text?: string,
  ): Promise<PostResult> {
    const app = await this.getAppForOrg(organizationId, appId);
    const config = app.telegram_automation;

    if (!config?.enabled) {
      return { success: false, error: "Automation not enabled for this app" };
    }

    const chatId = config.channelId || config.groupId;
    if (!chatId) {
      return { success: false, error: "No channel or group configured" };
    }

    const messageText = text || (await this.generateAnnouncement(app));

    const botToken = await telegramAutomationService.getBotToken(organizationId);
    if (!botToken) {
      return { success: false, error: "Bot not connected" };
    }

    const bot = new Telegraf(botToken);
    const chunks = splitMessage(messageText, TELEGRAM_RATE_LIMITS.MAX_MESSAGE_LENGTH);

    let lastMessageId: number | undefined;
    let lastError: string | undefined;

    try {
      for (const chunk of chunks) {
        const isLastChunk = chunk === chunks[chunks.length - 1];
        const replyMarkup = isLastChunk && app.app_url
          ? createInlineKeyboard([{ text: "Visit App", url: app.app_url }])
          : undefined;

        const result = await Promise.race([
          bot.telegram.sendMessage(chatId, chunk, {
            parse_mode: "HTML",
            reply_markup: replyMarkup,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Telegram API timeout")), 25_000),
          ),
        ]);

        lastMessageId = result.message_id;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Failed to send message";
      logger.error("[TelegramAppAutomation] Failed to post announcement", {
        appId,
        chatId,
        error: lastError,
      });
    }

    if (lastMessageId) {
      const currentConfig = app.telegram_automation || {
        enabled: false,
        autoReply: true,
        autoAnnounce: false,
        announceIntervalMin: 120,
        announceIntervalMax: 240,
      };

      await appsRepository.update(appId, {
        telegram_automation: {
          ...currentConfig,
          lastAnnouncementAt: new Date().toISOString(),
          totalMessages: (currentConfig.totalMessages || 0) + 1,
        },
      });

      logger.info("[TelegramAppAutomation] Announcement posted", {
        appId,
        chatId,
        messageId: lastMessageId,
      });

      return { success: true, messageId: lastMessageId, chatId };
    }

    return { success: false, error: lastError };
  }

  /**
   * Handle an incoming message for an app.
   */
  async handleIncomingMessage(
    organizationId: string,
    appId: string,
    message: {
      chatId: number | string;
      messageId: number;
      text: string;
      userName?: string;
      replyToMessageId?: number;
    },
  ): Promise<PostResult> {
    const app = await this.getAppForOrg(organizationId, appId);
    const config = app.telegram_automation;

    if (!config?.enabled || !config?.autoReply) {
      return { success: false, error: "Auto-reply not enabled" };
    }

    const botToken = await telegramAutomationService.getBotToken(organizationId);
    if (!botToken) {
      return { success: false, error: "Bot not connected" };
    }

    const replyText = await this.generateReply(app, message.text, message.userName);

    const bot = new Telegraf(botToken);

    try {
      const result = await Promise.race([
        bot.telegram.sendMessage(message.chatId, replyText, {
          reply_parameters: { message_id: message.messageId },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Telegram API timeout")), 25_000)
        ),
      ]);

      const currentConfig = app.telegram_automation || {
        enabled: false,
        autoReply: true,
        autoAnnounce: false,
        announceIntervalMin: 120,
        announceIntervalMax: 240,
      };

      await appsRepository.update(appId, {
        telegram_automation: {
          ...currentConfig,
          totalMessages: (currentConfig.totalMessages || 0) + 1,
        },
      });

      return { success: true, messageId: result.message_id, chatId: message.chatId };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Failed to send reply";
      logger.error("[TelegramAppAutomation] Failed to handle message", {
        appId,
        chatId: message.chatId,
        error: errorMsg,
      });
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Get all apps with active Telegram automation.
   */
  async getAppsWithActiveAutomation(organizationId: string): Promise<App[]> {
    const apps = await appsRepository.findByOrganization(organizationId);
    return apps.filter((app) => app.telegram_automation?.enabled);
  }
}

export const telegramAppAutomationService = new TelegramAppAutomationService();

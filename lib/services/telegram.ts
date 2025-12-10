/**
 * Telegram Service
 *
 * Handles all Telegram Bot API interactions for the cloud platform.
 * Provides methods for sending messages, managing groups, and webhook setup.
 */

import { logger } from "@/lib/utils/logger";
import { botsService } from "./bots";
import { secretsService } from "./secrets";
import { db } from "@/db";
import { orgPlatformConnections, orgPlatformServers } from "@/db/schemas/org-platforms";
import { eq, and } from "drizzle-orm";

const TELEGRAM_API_BASE = "https://api.telegram.org/bot";

// =============================================================================
// TYPES
// =============================================================================

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  entities?: TelegramMessageEntity[];
  reply_to_message?: TelegramMessage;
}

export interface TelegramMessageEntity {
  type: string;
  offset: number;
  length: number;
  url?: string;
  user?: TelegramUser;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
  inline_query?: TelegramInlineQuery;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
  chat_instance: string;
}

export interface TelegramInlineQuery {
  id: string;
  from: TelegramUser;
  query: string;
  offset: string;
}

export interface SendMessageParams {
  chat_id: number | string;
  text: string;
  parse_mode?: "HTML" | "Markdown" | "MarkdownV2";
  reply_to_message_id?: number;
  reply_markup?: TelegramReplyMarkup;
}

export interface TelegramReplyMarkup {
  inline_keyboard?: TelegramInlineKeyboardButton[][];
  keyboard?: TelegramKeyboardButton[][];
  remove_keyboard?: boolean;
  force_reply?: boolean;
}

export interface TelegramInlineKeyboardButton {
  text: string;
  url?: string;
  callback_data?: string;
}

export interface TelegramKeyboardButton {
  text: string;
  request_contact?: boolean;
  request_location?: boolean;
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

// =============================================================================
// API HELPERS
// =============================================================================

async function telegramApiRequest<T>(
  token: string,
  method: string,
  params?: Record<string, unknown>
): Promise<T> {
  const url = `${TELEGRAM_API_BASE}${token}/${method}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: params ? JSON.stringify(params) : undefined,
  });

  const data: TelegramApiResponse<T> = await response.json();

  if (!data.ok) {
    throw new Error(data.description ?? `Telegram API error: ${data.error_code}`);
  }

  return data.result as T;
}

// =============================================================================
// SERVICE CLASS
// =============================================================================

class TelegramService {
  /**
   * Get bot info using a token
   */
  async getMe(token: string): Promise<TelegramUser> {
    return telegramApiRequest<TelegramUser>(token, "getMe");
  }

  /**
   * Send a text message
   */
  async sendMessage(
    token: string,
    params: SendMessageParams
  ): Promise<TelegramMessage> {
    return telegramApiRequest<TelegramMessage>(token, "sendMessage", params);
  }

  /**
   * Send a message using a bot connection ID
   */
  async sendMessageViaConnection(
    connectionId: string,
    organizationId: string,
    chatId: number | string,
    text: string,
    options?: Partial<SendMessageParams>
  ): Promise<TelegramMessage> {
    const token = await botsService.getBotToken(connectionId, organizationId);

    return this.sendMessage(token, {
      chat_id: chatId,
      text,
      ...options,
    });
  }

  /**
   * Answer a callback query (button press)
   */
  async answerCallbackQuery(
    token: string,
    callbackQueryId: string,
    text?: string,
    showAlert = false
  ): Promise<boolean> {
    return telegramApiRequest<boolean>(token, "answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert,
    });
  }

  /**
   * Get chat information
   */
  async getChat(token: string, chatId: number | string): Promise<TelegramChat> {
    return telegramApiRequest<TelegramChat>(token, "getChat", { chat_id: chatId });
  }

  /**
   * Get chat member count
   */
  async getChatMemberCount(token: string, chatId: number | string): Promise<number> {
    return telegramApiRequest<number>(token, "getChatMemberCount", { chat_id: chatId });
  }

  /**
   * Get chat administrators
   */
  async getChatAdministrators(
    token: string,
    chatId: number | string
  ): Promise<Array<{ user: TelegramUser; status: string }>> {
    return telegramApiRequest(token, "getChatAdministrators", { chat_id: chatId });
  }

  /**
   * Leave a chat
   */
  async leaveChat(token: string, chatId: number | string): Promise<boolean> {
    return telegramApiRequest<boolean>(token, "leaveChat", { chat_id: chatId });
  }

  /**
   * Set webhook for receiving updates
   */
  async setWebhook(
    token: string,
    url: string,
    options?: {
      secret_token?: string;
      max_connections?: number;
      allowed_updates?: string[];
    }
  ): Promise<boolean> {
    return telegramApiRequest<boolean>(token, "setWebhook", {
      url,
      ...options,
    });
  }

  /**
   * Delete webhook
   */
  async deleteWebhook(token: string, dropPendingUpdates = false): Promise<boolean> {
    return telegramApiRequest<boolean>(token, "deleteWebhook", {
      drop_pending_updates: dropPendingUpdates,
    });
  }

  /**
   * Get webhook info
   */
  async getWebhookInfo(token: string): Promise<{
    url: string;
    has_custom_certificate: boolean;
    pending_update_count: number;
    last_error_date?: number;
    last_error_message?: string;
  }> {
    return telegramApiRequest(token, "getWebhookInfo");
  }

  // ===========================================================================
  // ORGANIZATION HELPERS
  // ===========================================================================

  /**
   * Find bot connection by chat ID
   */
  async findConnectionByChatId(chatId: string): Promise<{
    connection: typeof orgPlatformConnections.$inferSelect;
    server: typeof orgPlatformServers.$inferSelect;
  } | null> {
    const [server] = await db
      .select()
      .from(orgPlatformServers)
      .where(eq(orgPlatformServers.server_id, chatId))
      .limit(1);

    if (!server) return null;

    const [connection] = await db
      .select()
      .from(orgPlatformConnections)
      .where(
        and(
          eq(orgPlatformConnections.id, server.connection_id),
          eq(orgPlatformConnections.platform, "telegram"),
          eq(orgPlatformConnections.status, "active")
        )
      )
      .limit(1);

    if (!connection) return null;

    return { connection, server };
  }

  /**
   * Setup webhook for a Telegram bot connection
   */
  async setupWebhookForConnection(
    connectionId: string,
    organizationId: string,
    baseUrl: string
  ): Promise<void> {
    const token = await botsService.getBotToken(connectionId, organizationId);
    const webhookUrl = `${baseUrl}/api/webhooks/telegram`;
    const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;

    await this.setWebhook(token, webhookUrl, {
      secret_token: secretToken,
      allowed_updates: ["message", "callback_query", "inline_query", "edited_message"],
    });

    logger.info("[Telegram] Webhook configured", { connectionId, webhookUrl });
  }

  /**
   * List all chats/groups the bot is in (via servers table)
   */
  async listChats(
    connectionId: string,
    organizationId: string
  ): Promise<Array<{
    chatId: string;
    name: string;
    memberCount?: number;
    enabled: boolean;
  }>> {
    const servers = await botsService.getServers(connectionId);

    return servers.map((s) => ({
      chatId: s.server_id,
      name: s.server_name ?? "Unknown",
      memberCount: s.member_count ?? undefined,
      enabled: s.enabled,
    }));
  }

  /**
   * Sync chats for a Telegram bot connection
   */
  async syncChats(connectionId: string, organizationId: string): Promise<void> {
    // For Telegram, we can't list all chats - bot receives updates when added
    // This method is a placeholder for future implementation
    logger.info("[Telegram] Chat sync not fully implemented - chats are added via updates");
  }
}

export const telegramService = new TelegramService();


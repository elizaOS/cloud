/**
 * Telegram Webhook Handler (Dynamic Route)
 *
 * POST /api/webhooks/telegram/[botId]
 *
 * Handles incoming Telegram updates (messages, commands, etc.)
 * Routes to appropriate org agents based on the bot ID and chat.
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { telegramService } from "@/lib/services/telegram";
import { botsService } from "@/lib/services/bots";
import { db } from "@/db";
import { orgPlatformConnections, orgPlatformServers } from "@/db/schemas/org-platforms";
import { eq, and } from "drizzle-orm";

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
  inline_query?: TelegramInlineQuery;
}

interface TelegramMessage {
  message_id: number;
  from: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  entities?: TelegramEntity[];
  reply_to_message?: TelegramMessage;
}

interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
}

interface TelegramEntity {
  type: string;
  offset: number;
  length: number;
}

interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

interface TelegramInlineQuery {
  id: string;
  from: TelegramUser;
  query: string;
}

/**
 * Verify Telegram webhook secret token
 * SECURITY: Rejects all requests if no secret is configured to prevent spoofing
 */
function verifyTelegramToken(request: NextRequest): boolean {
  const token = request.headers.get("x-telegram-bot-api-secret-token");
  const expectedToken = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!expectedToken) {
    logger.error("[Telegram Webhook] SECURITY: TELEGRAM_WEBHOOK_SECRET not configured - rejecting request");
    return false;
  }

  // Use constant-time comparison to prevent timing attacks
  if (token === null || token.length !== expectedToken.length) {
    return false;
  }
  
  // Simple constant-time string comparison
  let result = 0;
  for (let i = 0; i < token.length; i++) {
    result |= token.charCodeAt(i) ^ expectedToken.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Find the org connection for a given bot ID
 */
async function findOrgConnection(botId: string) {
  const [connection] = await db
    .select()
    .from(orgPlatformConnections)
    .where(
      and(
        eq(orgPlatformConnections.platform, "telegram"),
        eq(orgPlatformConnections.platform_bot_id, botId),
        eq(orgPlatformConnections.status, "active")
      )
    )
    .limit(1);

  return connection;
}

/**
 * Check if chat is enabled for the organization
 */
async function isChatEnabled(connectionId: string, chatId: string): Promise<boolean> {
  const [server] = await db
    .select()
    .from(orgPlatformServers)
    .where(
      and(
        eq(orgPlatformServers.connection_id, connectionId),
        eq(orgPlatformServers.server_id, chatId),
        eq(orgPlatformServers.enabled, true)
      )
    )
    .limit(1);

  return !!server;
}

/**
 * Extract bot command from message
 */
function extractCommand(message: TelegramMessage): string | null {
  if (!message.text || !message.entities) return null;

  const commandEntity = message.entities.find((e) => e.type === "bot_command");
  if (!commandEntity) return null;

  return message.text.slice(commandEntity.offset, commandEntity.offset + commandEntity.length);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ botId: string }> }
) {
  const { botId } = await params;

  // Verify webhook token
  if (!verifyTelegramToken(request)) {
    logger.warn("[Telegram Webhook] Invalid webhook token", { botId });
    return NextResponse.json({ error: "Invalid webhook token" }, { status: 401 });
  }

  // Find the org connection for this bot
  const connection = await findOrgConnection(botId);
  if (!connection) {
    logger.warn("[Telegram Webhook] No active connection found for bot", { botId });
    return NextResponse.json({ ok: true }); // Acknowledge but don't process
  }

  const update: TelegramUpdate = await request.json();

  logger.info("[Telegram Webhook] Received update", {
    botId,
    updateId: update.update_id,
    organizationId: connection.organization_id,
    hasMessage: !!update.message,
    hasCallback: !!update.callback_query,
  });

  // Handle regular messages
  if (update.message) {
    const { message } = update;
    const chatId = String(message.chat.id);

    // Check if this chat is enabled for the org
    const chatEnabled = await isChatEnabled(connection.id, chatId);
    
    if (!chatEnabled && message.chat.type !== "private") {
      // For group chats, only respond if explicitly enabled
      logger.debug("[Telegram Webhook] Chat not enabled, ignoring", { chatId, botId });
      return NextResponse.json({ ok: true });
    }

    const command = extractCommand(message);
    const messageText = message.text || "";

    logger.info("[Telegram Webhook] Processing message", {
      chatId,
      chatType: message.chat.type,
      fromUser: message.from.username,
      command,
      organizationId: connection.organization_id,
    });

    // Handle commands
    if (command) {
      switch (command) {
        case "/start":
          await telegramService.sendMessageViaConnection(
            connection.id,
            connection.organization_id,
            message.chat.id,
            `Hello ${message.from.first_name}! I'm ready to assist you.`,
            { parse_mode: "HTML" }
          );
          break;

        case "/help":
          await telegramService.sendMessageViaConnection(
            connection.id,
            connection.organization_id,
            message.chat.id,
            "Available commands:\n/start - Start the bot\n/help - Show this help message",
            { parse_mode: "HTML" }
          );
          break;

        default:
          // Unknown command - could route to agent for handling
          logger.debug("[Telegram Webhook] Unknown command", { command, chatId });
      }
    } else if (messageText) {
      // Regular message - agent routing is available via the agent service
      // To enable agent responses for this org:
      // 1. Org must have at least one active agent character
      // 2. The org_platform_servers table should link the chat to a specific character
      // 3. Use agentsService.sendMessage() to route the message
      //
      // For now, we acknowledge receipt but don't generate agent responses.
      // Organizations should use the dashboard to configure character routing.
      logger.info("[Telegram Webhook] Message received", {
        chatId,
        textLength: messageText.length,
        organizationId: connection.organization_id,
        status: "acknowledged",
        note: "Configure character routing in dashboard to enable agent responses",
      });
    }

    return NextResponse.json({ ok: true });
  }

  // Handle callback queries (button presses)
  if (update.callback_query) {
    const { callback_query } = update;
    const token = await botsService.getBotToken(connection.id, connection.organization_id);

    logger.info("[Telegram Webhook] Processing callback", {
      callbackId: callback_query.id,
      data: callback_query.data,
      fromUser: callback_query.from.username,
    });

    // Acknowledge the callback to remove loading state
    await telegramService.answerCallbackQuery(token, callback_query.id);

    // Callback data handling is application-specific.
    // Organizations can implement custom handlers via the agent character system.
    // Common callback patterns: confirm_, cancel_, select_, menu_, etc.
    logger.debug("[Telegram Webhook] Callback acknowledged", {
      callbackId: callback_query.id,
      data: callback_query.data,
    });

    return NextResponse.json({ ok: true });
  }

  // Handle inline queries (used for @mention searches in Telegram)
  // Inline queries require Telegram Bot API's answerInlineQuery method
  // This is an advanced feature that most orgs don't need initially.
  if (update.inline_query) {
    logger.debug("[Telegram Webhook] Inline query received (not processed)", {
      queryId: update.inline_query.id,
      query: update.inline_query.query,
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}

/**
 * Handle webhook setup verification (GET request)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ botId: string }> }
) {
  const { botId } = await params;

  return NextResponse.json({
    status: "ok",
    service: "telegram-webhook",
    botId,
    timestamp: new Date().toISOString(),
  });
}

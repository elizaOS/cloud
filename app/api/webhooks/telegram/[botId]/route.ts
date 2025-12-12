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
      // Check if this is a reply to a notification message
      if (message.reply_to_message) {
        const replyToMessageId = String(message.reply_to_message.message_id);

        // Check if the reply is to a social notification message
        const { replyRouterService } = await import("@/lib/services/social-feed/reply-router");

        const result = await replyRouterService.processIncomingReply({
          platform: "telegram",
          channelId: chatId,
          messageId: String(message.message_id),
          replyToMessageId,
          userId: String(message.from.id),
          username: message.from.username,
          displayName: `${message.from.first_name}${message.from.last_name ? ` ${message.from.last_name}` : ""}`,
          content: messageText,
        });

        if (result) {
          // This was a reply to a social notification - confirmation prompt was sent
          logger.info("[Telegram Webhook] Reply to notification processed", {
            chatId,
            confirmationId: result.confirmationId,
            success: result.success,
          });
          return NextResponse.json({ ok: true });
        }
      }

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

    // Handle reply confirmation buttons
    if (callback_query.data?.startsWith("reply_confirm:") || callback_query.data?.startsWith("reply_reject:")) {
      const [action, confirmationId] = callback_query.data.split(":");
      const isConfirm = action === "reply_confirm";
      const chatId = callback_query.message?.chat.id;

      // Acknowledge with loading state
      await telegramService.answerCallbackQuery(token, callback_query.id, {
        text: isConfirm ? "Posting reply..." : "Cancelling...",
      });

      const { replyRouterService } = await import("@/lib/services/social-feed/reply-router");

      if (isConfirm) {
        const result = await replyRouterService.handleConfirmation(
          confirmationId,
          connection.organization_id,
          String(callback_query.from.id),
          callback_query.from.username
        );

        const message = result.success
          ? `✅ Reply posted successfully!${result.postUrl ? `\n\n${result.postUrl}` : ""}`
          : `❌ Failed to post reply: ${result.error}`;

        if (chatId && callback_query.message) {
          await telegramService.editMessageViaConnection(
            connection.id,
            connection.organization_id,
            chatId,
            callback_query.message.message_id,
            message,
            { parse_mode: "HTML" }
          );
        }
      } else {
        await replyRouterService.handleRejection(
          confirmationId,
          connection.organization_id,
          String(callback_query.from.id)
        );

        if (chatId && callback_query.message) {
          await telegramService.editMessageViaConnection(
            connection.id,
            connection.organization_id,
            chatId,
            callback_query.message.message_id,
            "❌ Reply was not sent.",
            { parse_mode: "HTML" }
          );
        }
      }

      return NextResponse.json({ ok: true });
    }

    // Acknowledge other callbacks
    await telegramService.answerCallbackQuery(token, callback_query.id);

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

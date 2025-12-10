/**
 * Telegram Webhook Handler
 *
 * POST /api/webhooks/telegram
 *
 * Handles incoming Telegram updates (messages, commands, etc.)
 * Routes to appropriate org agents based on chat and organization.
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { db } from "@/db";
import { orgPlatformConnections, orgPlatformServers } from "@/db/schemas/org-platforms";
import { eq, and } from "drizzle-orm";

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
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
 */
function verifyTelegramToken(request: NextRequest): boolean {
  const token = request.headers.get("x-telegram-bot-api-secret-token");
  const expectedToken = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!expectedToken) {
    // If no secret configured, allow all requests (development)
    logger.warn("[Telegram Webhook] No webhook secret configured");
    return true;
  }

  return token === expectedToken;
}

/**
 * Find the org connection for a given bot
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
async function isChatEnabled(connectionId: string, chatId: string) {
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

export async function POST(request: NextRequest) {
  // Verify webhook token
  if (!verifyTelegramToken(request)) {
    return NextResponse.json(
      { error: "Invalid webhook token" },
      { status: 401 }
    );
  }

  const update: TelegramUpdate = await request.json();

  logger.info("[Telegram Webhook] Received update", {
    updateId: update.update_id,
    hasMessage: !!update.message,
    hasCallback: !!update.callback_query,
  });

  // Handle regular messages
  if (update.message) {
    const { message } = update;
    const chatId = String(message.chat.id);

    // Check for bot command
    const command = extractCommand(message);

    logger.info("[Telegram Webhook] Processing message", {
      chatId,
      chatType: message.chat.type,
      fromUser: message.from.username,
      command,
      hasText: !!message.text,
    });

    // TODO: Find the org connection based on bot ID from request
    // TODO: Check if chat is enabled for org
    // TODO: Route to appropriate org agent

    // For now, acknowledge receipt
    return NextResponse.json({ ok: true });
  }

  // Handle callback queries (button presses)
  if (update.callback_query) {
    const { callback_query } = update;

    logger.info("[Telegram Webhook] Processing callback", {
      callbackId: callback_query.id,
      data: callback_query.data,
      fromUser: callback_query.from.username,
    });

    // TODO: Route callback to appropriate handler
    return NextResponse.json({ ok: true });
  }

  // Handle inline queries
  if (update.inline_query) {
    logger.info("[Telegram Webhook] Processing inline query", {
      queryId: update.inline_query.id,
      query: update.inline_query.query,
    });

    // TODO: Handle inline queries
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}

/**
 * Handle webhook setup verification (GET request)
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "telegram-webhook",
    timestamp: new Date().toISOString(),
  });
}


/**
 * Eliza App - Public Telegram Webhook
 *
 * Receives messages from Telegram and routes them to the default Eliza agent.
 * Auto-provisions users on first message.
 * Uses ASSISTANT mode for full multi-step action execution.
 *
 * POST /api/eliza-app/webhook/telegram
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { logger } from "@/lib/utils/logger";
import { RateLimitPresets, withRateLimit } from "@/lib/middleware/rate-limit";
import { elizaAppUserService } from "@/lib/services/eliza-app";
import { roomsService } from "@/lib/services/agents/rooms";
import { isAlreadyProcessed, markAsProcessed } from "@/lib/utils/idempotency";
import { generateElizaAppRoomId, generateElizaAppEntityId } from "@/lib/utils/deterministic-uuid";
import { elizaAppConfig } from "@/lib/services/eliza-app/config";
import { runtimeFactory } from "@/lib/eliza/runtime-factory";
import { createMessageHandler } from "@/lib/eliza/message-handler";
import { userContextService } from "@/lib/eliza/user-context";
import { AgentMode } from "@/lib/eliza/agent-mode-types";
import { distributedLocks } from "@/lib/cache/distributed-locks";
import type { Update, Message } from "telegraf/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const { defaultAgentId: DEFAULT_AGENT_ID } = elizaAppConfig;
const { botToken: BOT_TOKEN, webhookSecret: WEBHOOK_SECRET } = elizaAppConfig.telegram;
const { phoneNumber: BLOOIO_PHONE } = elizaAppConfig.blooio;

async function sendTelegramMessage(
  chatId: number,
  text: string,
  replyToMessageId?: number,
): Promise<boolean> {
  const response = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        reply_to_message_id: replyToMessageId,
        parse_mode: "Markdown",
      }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    logger.error("[ElizaApp TelegramWebhook] Failed to send message", {
      chatId,
      error,
    });
    return false;
  }

  return true;
}

async function handleMessage(message: Message): Promise<void> {
  if (!("text" in message) || !message.text) return;
  if (message.chat.type !== "private") return;

  const telegramUserId = String(message.from?.id);
  const text = message.text.trim();

  if (text.startsWith("/")) {
    await handleCommand(message);
    return;
  }

  const { user, organization } = await elizaAppUserService.findOrCreateByTelegram({
    id: message.from!.id,
    first_name: message.from!.first_name,
    last_name: message.from?.last_name,
    username: message.from?.username,
    auth_date: Math.floor(Date.now() / 1000),
    hash: "",
  });

  const roomId = generateElizaAppRoomId("telegram", DEFAULT_AGENT_ID, telegramUserId);
  const entityId = generateElizaAppEntityId("telegram", telegramUserId);

  const existingRoom = await roomsService.getRoomSummary(roomId);
  if (!existingRoom) {
    await roomsService.createRoom({
      id: roomId,
      agentId: DEFAULT_AGENT_ID,
      entityId,
      source: "telegram",
      type: "DM",
      name: `Telegram: ${message.from?.first_name || telegramUserId}`,
      metadata: {
        channel: "telegram",
        telegramUserId,
        telegramChatId: message.chat.id,
        userId: user.id,
        organizationId: organization.id,
      },
    });
    await roomsService.addParticipant(roomId, entityId, DEFAULT_AGENT_ID);
  }

  const lock = await distributedLocks.acquireRoomLockWithRetry(roomId, 60000, {
    maxRetries: 10,
    initialDelayMs: 100,
    maxDelayMs: 2000,
  });

  if (!lock) {
    logger.error("[ElizaApp TelegramWebhook] Failed to acquire room lock", { roomId });
    return;
  }

  try {
    const userContext = await userContextService.buildContext({
      user: { ...user, organization } as never,
      isAnonymous: false,
      agentMode: AgentMode.ASSISTANT,
    });
    userContext.characterId = DEFAULT_AGENT_ID;
    userContext.webSearchEnabled = true;

    logger.info("[ElizaApp TelegramWebhook] Processing message", {
      userId: user.id,
      roomId,
      mode: "assistant",
    });

    const runtime = await runtimeFactory.createRuntimeForUser(userContext);
    const messageHandler = createMessageHandler(runtime, userContext);

    const result = await messageHandler.process({
      roomId,
      text,
      agentModeConfig: { mode: AgentMode.ASSISTANT },
    });

    const responseContent = result.message.content;
    const responseText =
      typeof responseContent === "string"
        ? responseContent
        : responseContent?.text || "";

    if (responseText) {
      await sendTelegramMessage(message.chat.id, responseText, message.message_id);
    }
  } catch (error) {
    logger.error("[ElizaApp TelegramWebhook] Agent failed", {
      error: error instanceof Error ? error.message : String(error),
      roomId,
    });
  } finally {
    await lock.release();
  }
}

async function handleCommand(message: Message): Promise<void> {
  if (!("text" in message)) return;

  const command = message.text!.split(" ")[0].toLowerCase();
  const chatId = message.chat.id;

  switch (command) {
    case "/start":
      await sendTelegramMessage(
        chatId,
        `👋 *Welcome to Eliza!*\n\nI'm your AI assistant. Just send me a message and I'll help you with whatever you need.\n\nYou can also connect via iMessage by texting: \`${BLOOIO_PHONE}\``,
      );
      break;

    case "/help":
      await sendTelegramMessage(
        chatId,
        `*Available Commands*\n\n/start - Start the bot\n/help - Show this help message\n/status - Check your account status\n\nJust send me a message to chat!`,
      );
      break;

    case "/status": {
      const telegramUserId = String(message.from?.id);
      const user = await elizaAppUserService.getByTelegramId(telegramUserId);

      if (user) {
        const creditBalance = user.organization?.credit_balance || "0.00";
        await sendTelegramMessage(
          chatId,
          `*Account Status*\n\n✅ Connected\n💰 Credits: $${creditBalance}\n🆔 User ID: \`${user.id.substring(0, 8)}...\``,
        );
      } else {
        await sendTelegramMessage(
          chatId,
          `*Account Status*\n\n❌ Not connected yet\n\nSend me a message to create your account!`,
        );
      }
      break;
    }

    default:
      await sendTelegramMessage(
        chatId,
        `I don't recognize that command. Type /help to see available commands, or just send me a message!`,
      );
  }
}

async function handleTelegramWebhook(request: NextRequest): Promise<NextResponse> {
  if (WEBHOOK_SECRET) {
    const secretToken = request.headers.get("x-telegram-bot-api-secret-token");

    if (!secretToken) {
      logger.warn("[ElizaApp TelegramWebhook] Missing secret token");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const expectedBuffer = Buffer.from(WEBHOOK_SECRET);
    const receivedBuffer = Buffer.from(secretToken);

    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      logger.warn("[ElizaApp TelegramWebhook] Invalid secret token");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    logger.error("[ElizaApp TelegramWebhook] No webhook secret configured in production");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const update: Update = await request.json();
  const idempotencyKey = `telegram:eliza-app:${update.update_id}`;

  if (await isAlreadyProcessed(idempotencyKey)) {
    return NextResponse.json({ ok: true, status: "already_processed" });
  }

  if ("message" in update && update.message) {
    await handleMessage(update.message);
  }

  await markAsProcessed(idempotencyKey, "telegram-eliza-app");

  return NextResponse.json({ ok: true });
}

export const POST = withRateLimit(handleTelegramWebhook, RateLimitPresets.AGGRESSIVE);

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: "ok",
    service: "eliza-app-telegram-webhook",
  });
}

/**
 * Eliza App - Public Telegram Webhook
 *
 * Receives messages from Telegram and routes them to the default Eliza agent.
 * Requires OAuth registration at eliza.app before messaging.
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
import { generateElizaAppRoomId } from "@/lib/utils/deterministic-uuid";
import { elizaAppConfig } from "@/lib/services/eliza-app/config";
import { runtimeFactory } from "@/lib/eliza/runtime-factory";
import { createMessageHandler } from "@/lib/eliza/message-handler";
import { userContextService } from "@/lib/eliza/user-context";
import { AgentMode } from "@/lib/eliza/agent-mode-types";
import { distributedLocks } from "@/lib/cache/distributed-locks";
import { splitMessage, TELEGRAM_RATE_LIMITS, createTypingRefresh } from "@/lib/utils/telegram-helpers";
import type { Update, Message } from "telegraf/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const { defaultAgentId: DEFAULT_AGENT_ID } = elizaAppConfig;
const { botToken: BOT_TOKEN, webhookSecret: WEBHOOK_SECRET } = elizaAppConfig.telegram;
const { phoneNumber: BLOOIO_PHONE } = elizaAppConfig.blooio;

async function callSendMessage(payload: Record<string, unknown>): Promise<Response> {
  return fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function sendTypingIndicator(chatId: number): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" }),
    });
  } catch (error) {
    logger.debug("[ElizaApp TelegramWebhook] Typing indicator failed", {
      chatId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function sendWithMarkdownFallback(payload: Record<string, unknown>): Promise<boolean> {
  try {
    const response = await callSendMessage(payload);
    if (response.ok) return true;

    const firstError = await response.text();
    if (firstError.includes("can't parse entities")) {
      logger.warn("[ElizaApp TelegramWebhook] Markdown parse failed, retrying as plain text", {
        chatId: payload.chat_id,
      });
      const { parse_mode: _, ...plain } = payload;
      const retryResponse = await callSendMessage(plain);
      if (retryResponse.ok) return true;

      const retryError = await retryResponse.text();
      logger.error("[ElizaApp TelegramWebhook] Failed to send message (plain-text retry also failed)", {
        chatId: payload.chat_id,
        error: retryError,
      });
      return false;
    }

    logger.error("[ElizaApp TelegramWebhook] Failed to send message", {
      chatId: payload.chat_id,
      error: firstError,
    });
    return false;
  } catch (error) {
    logger.error("[ElizaApp TelegramWebhook] Network error sending message", {
      chatId: payload.chat_id,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

const URL_PATTERN = /https?:\/\/\S{60,}/;

async function sendTelegramMessage(
  chatId: number,
  text: string,
  replyToMessageId?: number,
): Promise<boolean> {
  const chunks = splitMessage(text, TELEGRAM_RATE_LIMITS.MAX_MESSAGE_LENGTH);
  if (chunks.length === 0) return true;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const hasLongUrl = URL_PATTERN.test(chunk);
    const ok = await sendWithMarkdownFallback({
      chat_id: chatId,
      text: chunk,
      reply_to_message_id: i === 0 ? replyToMessageId : undefined,
      ...(hasLongUrl ? {} : { parse_mode: "Markdown" }),
    });
    if (!ok) return false;
  }
  return true;
}

async function handleMessage(message: Message): Promise<boolean> {
  if (!("text" in message) || !message.text) return true;
  if (message.chat.type !== "private") return true;
  if (!message.from) return true;

  const telegramUserId = String(message.from.id);
  const text = message.text.trim();

  if (text.startsWith("/")) {
    await handleCommand(message as Message & { text: string });
    return true;
  }

  const userWithOrg = await elizaAppUserService.getByTelegramId(telegramUserId);
  if (!userWithOrg?.organization) {
    await sendTelegramMessage(
      message.chat.id,
      `👋 Welcome! To chat with Eliza, please connect your Telegram first:\n\n${elizaAppConfig.appUrl}/get-started`,
    );
    return true;
  }
  const { organization } = userWithOrg;

  const roomId = generateElizaAppRoomId("telegram", DEFAULT_AGENT_ID, telegramUserId);
  const entityId = userWithOrg.id;

  const existingRoom = await roomsService.getRoomSummary(roomId);
  if (!existingRoom) {
    await roomsService.createRoom({
      id: roomId,
      agentId: DEFAULT_AGENT_ID,
      entityId,
      source: "telegram",
      type: "DM",
      name: `Telegram: ${message.from.first_name || telegramUserId}`,
      metadata: {
        channel: "telegram",
        telegramUserId,
        telegramChatId: message.chat.id,
        userId: entityId,
        organizationId: organization.id,
      },
    });
  }
  // Always ensure participant exists (handles partial failures on retry)
  try {
    await roomsService.addParticipant(roomId, entityId, DEFAULT_AGENT_ID);
  } catch (error) {
    // Ignore "already exists" errors, re-throw others
    const msg = error instanceof Error ? error.message : String(error);
    if (!msg.includes("already") && !msg.includes("duplicate") && !msg.includes("exists")) {
      throw error;
    }
  }

  // TTL must be >= maxDuration (120s) to prevent lock expiry during processing
  const lock = await distributedLocks.acquireRoomLockWithRetry(roomId, 120000, {
    maxRetries: 10,
    initialDelayMs: 100,
    maxDelayMs: 2000,
  });

  if (!lock) {
    logger.error("[ElizaApp TelegramWebhook] Failed to acquire room lock", { roomId });
    return false; // Don't mark as processed - allow retry
  }

  let typing: { stop: () => void } | null = null;
  try {
    typing = BOT_TOKEN
      ? createTypingRefresh(message.chat.id, BOT_TOKEN, 4000, (error) => {
          logger.debug("[ElizaApp TelegramWebhook] Typing refresh failed", {
            chatId: message.chat.id,
            error: error instanceof Error ? error.message : String(error),
          });
        })
      : null;

    if (BOT_TOKEN) await sendTypingIndicator(message.chat.id);

    const userContext = await userContextService.buildContext({
      user: { ...userWithOrg, organization } as never,
      isAnonymous: false,
      agentMode: AgentMode.ASSISTANT,
    });
    userContext.characterId = DEFAULT_AGENT_ID;
    userContext.webSearchEnabled = true;
    userContext.modelPreferences = elizaAppConfig.modelPreferences;

    logger.info("[ElizaApp TelegramWebhook] Processing message", {
      userId: entityId,
      roomId,
      mode: "assistant",
    });

    const runtime = await runtimeFactory.createRuntimeForUser(userContext);

    const telegramChannelContext = [
      "\n# Channel Context",
      "The user is chatting with you on **Telegram**. Keep these rules in mind:",
      "- The user is ALREADY on Telegram — never suggest them to \"connect Telegram\" or install Telegram.",
      "- \"Connect [platform]\" means OAuth-linking an external service (Google, Twitter, Slack, etc.), NOT the messaging channel they're on.",
      "- Telegram IS a supported integration for n8n workflows. You CAN create automations that send messages to the user on Telegram.",
      `- The user's Telegram chat ID for automations is: ${message.chat.id}`,
      "- Keep responses concise — Telegram is a mobile-first chat interface.",
      "- Use short paragraphs. Avoid walls of text.",
      `- The user's name is ${message.from.first_name || "there"}.`,
    ].join("\n");

    const originalSystemPrompt = runtime.character?.system;
    if (runtime.character) {
      runtime.character.system = (runtime.character.system || "") + telegramChannelContext;
    } else {
      logger.warn("[ElizaApp TelegramWebhook] runtime.character is null — channel context not injected", { roomId });
    }

    try {
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

      if (!responseText) {
        logger.warn("[ElizaApp TelegramWebhook] Agent returned empty response", { roomId });
        await sendTelegramMessage(
          message.chat.id,
          "I processed your message but didn't have a response. Could you try rephrasing?",
          message.message_id,
        );
      } else {
        const sent = await sendTelegramMessage(message.chat.id, responseText, message.message_id);
        if (!sent) {
          logger.error("[ElizaApp TelegramWebhook] Failed to deliver response to user", { roomId, chatId: message.chat.id });
          return false;
        }
      }
      return true;
    } catch (error) {
      logger.error("[ElizaApp TelegramWebhook] Agent failed", {
        error: error instanceof Error ? error.message : String(error),
        roomId,
      });
      try {
        await sendTelegramMessage(
          message.chat.id,
          "I couldn't process that — my connection timed out. Try sending your message again. If it keeps happening, type /start to reset.",
          message.message_id,
        );
      } catch (sendError) {
        logger.error("[ElizaApp TelegramWebhook] Failed to send error message to user", {
          chatId: message.chat.id,
          error: sendError instanceof Error ? sendError.message : String(sendError),
        });
      }
      // Intentional: mark as processed even on agent failure to prevent infinite Telegram retries.
      // Transient failures (lock contention) return false above to allow retry.
      return true;
    } finally {
      if (runtime.character) {
        runtime.character.system = originalSystemPrompt;
      }
    }
  } catch (setupError) {
    logger.error("[ElizaApp TelegramWebhook] Setup failed", {
      error: setupError instanceof Error ? setupError.message : String(setupError),
      chatId: message.chat.id,
    });
    try {
      await sendTelegramMessage(
        message.chat.id,
        "Something went wrong on our end. Please try again in a moment.",
        message.message_id,
      );
    } catch { /* best-effort delivery */ }
    return false;
  } finally {
    typing?.stop();
    await lock.release();
  }
}

async function sendCommandResponse(
  chatId: number,
  command: string,
  send: () => Promise<boolean>,
): Promise<void> {
  const ok = await send();
  if (!ok) {
    logger.warn("[ElizaApp TelegramWebhook] Command response failed to deliver", { chatId, command });
  }
}

async function handleCommand(message: Message & { text: string }): Promise<void> {
  const command = message.text.trim().split(" ")[0].toLowerCase();
  const chatId = message.chat.id;

  try {
    switch (command) {
      case "/start":
        await sendCommandResponse(chatId, command, () =>
          sendTelegramMessage(
            chatId,
            `👋 *Welcome to Eliza!*\n\nI'm your AI assistant. Just send me a message and I'll help you with whatever you need.\n\nYou can also connect via iMessage by texting: \`${BLOOIO_PHONE}\``,
          ),
        );
        break;

      case "/help":
        await sendCommandResponse(chatId, command, () =>
          sendTelegramMessage(
            chatId,
            `*Available Commands*\n\n/start - Start the bot\n/help - Show this help message\n/status - Check your account status\n\nJust send me a message to chat!`,
          ),
        );
        break;

      case "/status": {
        if (!message.from) break;
        const telegramUserId = String(message.from.id);
        const user = await elizaAppUserService.getByTelegramId(telegramUserId);

        if (user) {
          const creditBalance = user.organization?.credit_balance || "0.00";
          await sendCommandResponse(chatId, command, () =>
            sendTelegramMessage(
              chatId,
              `*Account Status*\n\n✅ Connected\n💰 Credits: $${creditBalance}\n🆔 User ID: \`${user.id.substring(0, 8)}...\``,
            ),
          );
        } else {
          await sendCommandResponse(chatId, command, () =>
            sendTelegramMessage(
              chatId,
              `*Account Status*\n\n❌ Not connected yet\n\nConnect your Telegram at: ${elizaAppConfig.appUrl}/get-started`,
            ),
          );
        }
        break;
      }

      default:
        await sendCommandResponse(chatId, command, () =>
          sendTelegramMessage(
            chatId,
            `I don't recognize that command. Type /help to see available commands, or just send me a message!`,
          ),
        );
    }
  } catch (error) {
    logger.error("[ElizaApp TelegramWebhook] Command handler failed", {
      chatId,
      command,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function handleTelegramWebhook(request: NextRequest): Promise<NextResponse> {
  // Fail closed: require webhook secret unless explicitly skipped in dev
  const skipVerification =
    process.env.SKIP_WEBHOOK_VERIFICATION === "true" &&
    process.env.NODE_ENV !== "production";

  if (!WEBHOOK_SECRET) {
    if (skipVerification) {
      logger.warn("[ElizaApp TelegramWebhook] Signature verification skipped (dev mode)");
    } else {
      logger.error("[ElizaApp TelegramWebhook] WEBHOOK_SECRET is required");
      return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
    }
  } else {
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
  }

  let update: Update;
  try {
    update = await request.json();
  } catch (error) {
    logger.error("[ElizaApp TelegramWebhook] Failed to parse request body", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const idempotencyKey = `telegram:eliza-app:${update.update_id}`;

  if (await isAlreadyProcessed(idempotencyKey)) {
    return NextResponse.json({ ok: true, status: "already_processed" });
  }

  let processed = true;
  if ("message" in update && update.message) {
    processed = await handleMessage(update.message);
  }

  if (processed) {
    await markAsProcessed(idempotencyKey, "telegram-eliza-app");
    return NextResponse.json({ ok: true });
  }

  // 503 triggers webhook retry from Telegram
  return NextResponse.json(
    { ok: false, error: "Service temporarily unavailable" },
    { status: 503 },
  );
}

export const POST = withRateLimit(handleTelegramWebhook, RateLimitPresets.AGGRESSIVE);

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: "ok",
    service: "eliza-app-telegram-webhook",
  });
}

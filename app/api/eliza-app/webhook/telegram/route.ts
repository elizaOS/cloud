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
import { createPerfTrace } from "@/lib/utils/perf-trace";
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

/**
 * PERF: Send "typing" indicator to show the user that the bot is processing.
 * This dramatically improves perceived latency -- users see immediate feedback
 * instead of waiting 3-8s with no indication.
 * Telegram automatically clears the typing indicator after 5 seconds,
 * so we repeat it periodically for longer processing.
 */
async function sendTypingAction(chatId: number): Promise<void> {
  try {
    await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          action: "typing",
        }),
      },
    );
  } catch (error) {
    // Non-critical, don't fail the request
    logger.debug("[ElizaApp TelegramWebhook] Failed to send typing action", {
      chatId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Start a periodic typing indicator that auto-refreshes every 4 seconds.
 * Returns a cleanup function to stop the interval.
 * Telegram clears typing after 5s, so we refresh at 4s to maintain continuity.
 */
function startTypingIndicator(chatId: number): () => void {
  // Send immediately
  sendTypingAction(chatId);
  // Refresh every 4 seconds
  const interval = setInterval(() => sendTypingAction(chatId), 4000);
  return () => clearInterval(interval);
}

async function handleMessage(message: Message): Promise<boolean> {
  if (!("text" in message) || !message.text) return true; // Not applicable, mark as processed
  if (message.chat.type !== "private") return true; // Not applicable, mark as processed

  // Defensive check - message.from should exist in private chats but validate anyway
  if (!message.from) {
    logger.warn("[ElizaApp TelegramWebhook] Message missing sender (from)");
    return true; // Not applicable, mark as processed
  }

  const telegramUserId = String(message.from.id);
  const text = message.text.trim();

  if (text.startsWith("/")) {
    await handleCommand(message);
    return true; // Command handled, mark as processed
  }

  // PERF: Granular timing for the webhook pipeline
  const perfTrace = createPerfTrace("telegram-webhook");

  // PERF: Start typing indicator immediately to show the user we're processing.
  // This gives instant visual feedback while we perform auth, room setup, and LLM calls.
  const stopTyping = startTypingIndicator(message.chat.id);

  perfTrace.mark("user-lookup");
  // Look up user - they must have completed OAuth first
  const userWithOrg = await elizaAppUserService.getByTelegramId(telegramUserId);
  if (!userWithOrg?.organization) {
    stopTyping();
    await sendTelegramMessage(
      message.chat.id,
      `👋 Welcome! To chat with Eliza, please connect your Telegram first:\n\n${elizaAppConfig.appUrl}/get-started`,
    );
    return true; // Mark as processed - don't retry
  }
  const { organization } = userWithOrg;

  const roomId = generateElizaAppRoomId("telegram", DEFAULT_AGENT_ID, telegramUserId);
  const entityId = userWithOrg.id; // Use userId as entityId for unified memory

  perfTrace.mark("room-setup");
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

  perfTrace.mark("acquire-lock");
  // TTL must be >= maxDuration (120s) to prevent lock expiry during processing
  const lock = await distributedLocks.acquireRoomLockWithRetry(roomId, 120000, {
    maxRetries: 10,
    initialDelayMs: 100,
    maxDelayMs: 2000,
  });

  if (!lock) {
    stopTyping();
    logger.error("[ElizaApp TelegramWebhook] Failed to acquire room lock", { roomId });
    return false; // Don't mark as processed - allow retry
  }

  try {
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

    perfTrace.mark("create-runtime");
    const runtime = await runtimeFactory.createRuntimeForUser(userContext);
    const messageHandler = createMessageHandler(runtime, userContext);

    perfTrace.mark("message-processing");
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

    // Stop typing indicator before sending the response
    stopTyping();

    perfTrace.mark("send-response");
    if (responseText) {
      await sendTelegramMessage(message.chat.id, responseText, message.message_id);
    }
    perfTrace.end();
    return true;
  } catch (error) {
    stopTyping();
    perfTrace.end();
    logger.error("[ElizaApp TelegramWebhook] Agent failed", {
      error: error instanceof Error ? error.message : String(error),
      roomId,
    });
    return true; // Processing attempted, mark as processed to avoid infinite retry
  } finally {
    await lock.release();
  }
}

async function handleCommand(message: Message): Promise<void> {
  if (!("text" in message)) return;

  // Trim to handle leading whitespace (matching handleMessage's detection logic)
  const command = message.text!.trim().split(" ")[0].toLowerCase();
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
          `*Account Status*\n\n❌ Not connected yet\n\nConnect your Telegram at: ${elizaAppConfig.appUrl}/get-started`,
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

  const update: Update = await request.json();
  const idempotencyKey = `telegram:eliza-app:${update.update_id}`;

  if (await isAlreadyProcessed(idempotencyKey)) {
    return NextResponse.json({ ok: true, status: "already_processed" });
  }

  let processed = true;
  if ("message" in update && update.message) {
    processed = await handleMessage(update.message);
  }

  // Only mark as processed if handler succeeded (prevents lost messages on lock failure)
  if (processed) {
    await markAsProcessed(idempotencyKey, "telegram-eliza-app");
  }

  // Return 503 on lock failure to trigger webhook retry from Telegram
  if (!processed) {
    return NextResponse.json(
      { ok: false, error: "Service temporarily unavailable" },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true });
}

export const POST = withRateLimit(handleTelegramWebhook, RateLimitPresets.AGGRESSIVE);

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: "ok",
    service: "eliza-app-telegram-webhook",
  });
}

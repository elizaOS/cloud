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
import { elizaAppUserService } from "@/lib/services/eliza-app/user-service";
import { roomsService } from "@/lib/services/agents/rooms";
import { tryClaimForProcessing } from "@/lib/utils/idempotency";
import { generateElizaAppRoomId } from "@/lib/utils/deterministic-uuid";
import { elizaAppConfig } from "@/lib/services/eliza-app/config";
import { runtimeFactory } from "@/lib/eliza/runtime-factory";
import { createMessageHandler } from "@/lib/eliza/message-handler";
import { userContextService } from "@/lib/eliza/user-context";
import { AgentMode } from "@/lib/eliza/agent-mode-types";
import { distributedLocks } from "@/lib/cache/distributed-locks";
import { createPerfTrace } from "@/lib/utils/perf-trace";
import { splitMessage, TELEGRAM_RATE_LIMITS, createTypingRefresh } from "@/lib/utils/telegram-helpers";
import type { Update, Message } from "telegraf/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function getTelegramConfig() {
  return elizaAppConfig.telegram;
}

function getDefaultAgentId() {
  return elizaAppConfig.defaultAgentId;
}

function getBlooioPhoneNumber() {
  return elizaAppConfig.blooio.phoneNumber;
}

async function callSendMessage(payload: Record<string, unknown>): Promise<Response> {
  return fetch(`https://api.telegram.org/bot${getTelegramConfig().botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function cleanUrlMarkdown(text: string): string {
  return text.replace(
    /(^|[\s(])([*_]{1,2})(https?:\/\/[^\s]+?)\2(?=$|[\s),.!?:;])/g,
    (_match, prefix: string, _delimiter: string, url: string) =>
      `${prefix}${url}`,
  );
}

async function sendTypingIndicator(chatId: number): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${getTelegramConfig().botToken}/sendChatAction`, {
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
      text: cleanUrlMarkdown(chunk),
      reply_to_message_id: i === 0 ? replyToMessageId : undefined,
      ...(hasLongUrl ? {} : { parse_mode: "Markdown" }),
    });
    if (!ok) return false;
  }
  return true;
}

async function handleMessage(message: Message): Promise<void> {
  if (!("text" in message) || !message.text) return;
  if (message.chat.type !== "private") return;

  if (!message.from) {
    logger.warn("[ElizaApp TelegramWebhook] Message missing sender (from)");
    return;
  }

  const telegramUserId = String(message.from.id);
  const text = message.text.trim();

  if (text.startsWith("/")) {
    await handleCommand(message as Message & { text: string });
    return;
  }

  const perfTrace = createPerfTrace("telegram-webhook");

  try {
    perfTrace.mark("user-lookup");
    const userWithOrg = await elizaAppUserService.getByTelegramId(telegramUserId);
    if (!userWithOrg?.organization) {
      await sendTelegramMessage(
        message.chat.id,
        `👋 Welcome! To chat with Eliza, please connect your Telegram first:\n\n${elizaAppConfig.appUrl}/get-started`,
      );
      return;
    }
    const { organization } = userWithOrg;
    const defaultAgentId = getDefaultAgentId();

    const roomId = generateElizaAppRoomId(
      "telegram",
      defaultAgentId,
      telegramUserId,
    );
    const entityId = userWithOrg.id;

    perfTrace.mark("room-setup");
    const existingRoom = await roomsService.getRoomSummary(roomId);
    if (!existingRoom) {
      await roomsService.createRoom({
        id: roomId,
        agentId: defaultAgentId,
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
    try {
      await roomsService.addParticipant(roomId, entityId, defaultAgentId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (!msg.includes("already") && !msg.includes("duplicate") && !msg.includes("exists")) {
        throw error;
      }
    }

    perfTrace.mark("acquire-lock");
    const lock = await distributedLocks.acquireRoomLockWithRetry(roomId, 120000, {
      maxRetries: 10,
      initialDelayMs: 100,
      maxDelayMs: 2000,
    });

    if (!lock) {
      logger.warn("[ElizaApp TelegramWebhook] Room locked - message already being processed", {
        roomId,
        lockServiceEnabled: distributedLocks.isEnabled(),
      });
      return;
    }

    let typing: { stop: () => void } | null = null;
    try {
      const { botToken } = getTelegramConfig();
      typing = botToken
        ? createTypingRefresh(message.chat.id, botToken, 4000, (error) => {
            logger.debug("[ElizaApp TelegramWebhook] Typing refresh failed", {
              chatId: message.chat.id,
              error: error instanceof Error ? error.message : String(error),
            });
          })
        : null;

      if (botToken) {
        await sendTypingIndicator(message.chat.id);
      }

      const userContext = await userContextService.buildContext({
        user: { ...userWithOrg, organization } as never,
        isAnonymous: false,
        agentMode: AgentMode.ASSISTANT,
      });
      userContext.characterId = defaultAgentId;
      userContext.webSearchEnabled = true;
      userContext.modelPreferences = elizaAppConfig.modelPreferences;
      
      const { name, description, ...promptConfig } = elizaAppConfig.promptPreset;
      userContext.appPromptConfig = promptConfig;

      logger.info("[ElizaApp TelegramWebhook] Processing message", {
        userId: entityId,
        roomId,
        mode: "assistant",
      });

      perfTrace.mark("create-runtime");
      const runtime = await runtimeFactory.createRuntimeForUser(userContext);

      const telegramChannelContext = [
        "\n# Channel Context",
        "The user is chatting with you on **Telegram**. Keep these rules in mind:",
        '- The user is ALREADY on Telegram - never suggest them to "connect Telegram" or install Telegram.',
        '- "Connect [platform]" means OAuth-linking an external service (Google, Twitter, Slack, etc.), NOT the messaging channel they are on.',
        "- Telegram IS a supported integration for n8n workflows. You CAN create automations that send messages to the user on Telegram.",
        `- The user's Telegram chat ID for automations is: ${message.chat.id}`,
        "- Keep responses concise - Telegram is a mobile-first chat interface.",
        "- Use short paragraphs. Avoid walls of text.",
        `- The user's name is ${(message.from.first_name || "there").replace(/\p{Cc}/gu, "").slice(0, 64)}.`,
      ].join("\n");

      const originalSystemPrompt = runtime.character?.system;
      if (runtime.character) {
        runtime.character.system =
          (runtime.character.system || "") + telegramChannelContext;
      } else {
        logger.warn(
          "[ElizaApp TelegramWebhook] runtime.character is null - channel context not injected",
          { roomId },
        );
      }

      try {
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

        perfTrace.mark("send-response");
        if (!responseText) {
          logger.warn("[ElizaApp TelegramWebhook] Agent returned empty response", {
            roomId,
          });
          await sendTelegramMessage(
            message.chat.id,
            "I processed your message but didn't have a response. Could you try rephrasing?",
            message.message_id,
          );
        } else {
          await sendTelegramMessage(
            message.chat.id,
            responseText,
            message.message_id,
          );
        }
      } catch (error) {
        logger.error("[ElizaApp TelegramWebhook] Agent failed", {
          error: error instanceof Error ? error.message : String(error),
          roomId,
        });
        try {
          await sendTelegramMessage(
            message.chat.id,
            "I couldn't process that - something went wrong. Try sending your message again.",
            message.message_id,
          );
        } catch (sendError) {
          logger.error(
            "[ElizaApp TelegramWebhook] Failed to send error message to user",
            {
              chatId: message.chat.id,
              error:
                sendError instanceof Error
                  ? sendError.message
                  : String(sendError),
            },
          );
        }
      } finally {
        if (runtime.character) {
          runtime.character.system = originalSystemPrompt;
        }
      }
    } catch (error) {
      logger.error("[ElizaApp TelegramWebhook] Setup failed", {
        error: error instanceof Error ? error.message : String(error),
        chatId: message.chat.id,
      });
      try {
        await sendTelegramMessage(
          message.chat.id,
          "Something went wrong on our end. Please try again in a moment.",
          message.message_id,
        );
      } catch {
        // Best-effort delivery only.
      }
    } finally {
      typing?.stop();
      await lock.release();
    }
  } finally {
    perfTrace.end();
  }
}

async function handleCommand(message: Message & { text: string }): Promise<void> {
  const command = message.text.trim().split(" ")[0].toLowerCase();
  const chatId = message.chat.id;

  try {
    switch (command) {
      case "/start":
        await sendTelegramMessage(
          chatId,
          `👋 *Welcome to Eliza!*\n\nI'm your AI assistant. Just send me a message and I'll help you with whatever you need.\n\nYou can also connect via iMessage by texting: \`${getBlooioPhoneNumber()}\``,
        );
        break;

      case "/help":
        await sendTelegramMessage(
          chatId,
          "*Available Commands*\n\n/start - Start the bot\n/help - Show this help message\n/status - Check your account status\n\nJust send me a message to chat!",
        );
        break;

      case "/status": {
        if (!message.from) break;
        const telegramUserId = String(message.from.id);
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
          "I don't recognize that command. Type /help to see available commands, or just send me a message!",
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
  const webhookSecret = getTelegramConfig().webhookSecret;
  // Fail closed: require webhook secret unless explicitly skipped in dev
  const skipVerification =
    process.env.SKIP_WEBHOOK_VERIFICATION === "true" &&
    process.env.NODE_ENV !== "production";

  if (!webhookSecret) {
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

    const expectedBuffer = Buffer.from(webhookSecret);
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

  const claimed = await tryClaimForProcessing(idempotencyKey, "telegram-eliza-app");
  if (!claimed) {
    return NextResponse.json({ ok: true, status: "already_processed" });
  }

  if ("message" in update && update.message) {
    await handleMessage(update.message);
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

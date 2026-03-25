/**
 * Eliza App - Public WhatsApp Webhook
 *
 * Receives messages from WhatsApp Cloud API and routes them to the default Eliza agent.
 * Auto-provisions users on first message based on WhatsApp ID (phone number digits).
 * Uses ASSISTANT mode for full multi-step action execution.
 *
 * Cross-platform: Since WhatsApp ID IS a phone number, accounts are automatically
 * linked with Telegram/iMessage users who have the same phone number.
 *
 * GET  /api/eliza-app/webhook/whatsapp  -- Webhook verification handshake
 * POST /api/eliza-app/webhook/whatsapp  -- Incoming messages
 */

import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { distributedLocks } from "@/lib/cache/distributed-locks";
import { AgentMode } from "@/lib/eliza/agent-mode-types";
import { createMessageHandler } from "@/lib/eliza/message-handler";
import { runtimeFactory } from "@/lib/eliza/runtime-factory";
import { userContextService } from "@/lib/eliza/user-context";
import { RateLimitPresets, withRateLimit } from "@/lib/middleware/rate-limit";
import { roomsService } from "@/lib/services/agents/rooms";
import { elizaAppUserService } from "@/lib/services/eliza-app";
import { elizaAppConfig } from "@/lib/services/eliza-app/config";
import { whatsAppAuthService } from "@/lib/services/eliza-app/whatsapp-auth";
import type { UserWithOrganization } from "@/lib/types";
import { generateElizaAppRoomId } from "@/lib/utils/deterministic-uuid";
import { releaseProcessingClaim, tryClaimForProcessing } from "@/lib/utils/idempotency";
import { logger } from "@/lib/utils/logger";
import { createPerfTrace } from "@/lib/utils/perf-trace";
import {
  extractWhatsAppMessages,
  isValidWhatsAppId,
  markWhatsAppMessageAsRead,
  parseWhatsAppWebhookPayload,
  sendWhatsAppMessage,
  startWhatsAppTypingIndicator,
  type WhatsAppIncomingMessage,
} from "@/lib/utils/whatsapp-api";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROOM_LOCK_TTL_MS = maxDuration * 1000;

function getDefaultAgentId() {
  return elizaAppConfig.defaultAgentId;
}

function getWhatsAppConfig() {
  return elizaAppConfig.whatsapp;
}

async function sendWhatsAppResponse(to: string, text: string): Promise<boolean> {
  const { accessToken, phoneNumberId } = getWhatsAppConfig();

  try {
    const response = await sendWhatsAppMessage(accessToken, phoneNumberId, to, text);

    logger.info("[ElizaApp WhatsAppWebhook] Message sent", {
      to,
      messageId: response.messages?.[0]?.id,
    });

    return true;
  } catch (error) {
    logger.error("[ElizaApp WhatsAppWebhook] Failed to send message", {
      to,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function handleIncomingMessage(msg: WhatsAppIncomingMessage): Promise<boolean> {
  const text = msg.text?.trim();
  if (!text) return true;

  const { accessToken, phoneNumberId } = getWhatsAppConfig();

  if (!isValidWhatsAppId(msg.from)) {
    logger.warn("[ElizaApp WhatsAppWebhook] Invalid WhatsApp ID format, skipping", {
      from: msg.from,
      messageId: msg.messageId,
    });
    return true;
  }

  const markRead = async (retries = 2) => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await markWhatsAppMessageAsRead(accessToken, phoneNumberId, msg.messageId);
        return;
      } catch (err) {
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        } else {
          logger.warn("[ElizaApp WhatsAppWebhook] Failed to mark as read after retries", {
            messageId: msg.messageId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  };
  void markRead();

  const perfTrace = createPerfTrace("whatsapp-webhook");
  const stopTyping = startWhatsAppTypingIndicator(accessToken, phoneNumberId, msg.messageId);

  try {
    perfTrace.mark("user-provisioning");
    logger.info("[ElizaApp WhatsAppWebhook] Auto-provisioning user", {
      whatsappId: `***${msg.from.slice(-4)}`,
      profileName: msg.profileName,
    });

    const {
      user: userWithOrg,
      organization,
      isNew,
    } = await elizaAppUserService.findOrCreateByWhatsAppId(msg.from, msg.profileName);

    logger.info("[ElizaApp WhatsAppWebhook] User provisioned", {
      userId: userWithOrg.id,
      organizationId: organization.id,
      isNewUser: isNew,
      whatsappId: `***${msg.from.slice(-4)}`,
    });

    const roomId = generateElizaAppRoomId("whatsapp", getDefaultAgentId(), msg.from);
    const entityId = userWithOrg.id;

    perfTrace.mark("room-setup");
    const existingRoom = await roomsService.getRoomSummary(roomId);
    if (!existingRoom) {
      await roomsService.createRoom({
        id: roomId,
        agentId: getDefaultAgentId(),
        entityId,
        source: "whatsapp",
        type: "DM",
        name: `WhatsApp: ${msg.profileName || msg.from}`,
        metadata: {
          channel: "whatsapp",
          whatsappId: msg.from,
          userId: entityId,
          organizationId: organization.id,
        },
      });
    }

    try {
      await roomsService.addParticipant(roomId, entityId, getDefaultAgentId());
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (
        !errMsg.includes("already") &&
        !errMsg.includes("duplicate") &&
        !errMsg.includes("exists")
      ) {
        throw error;
      }
    }

    perfTrace.mark("acquire-lock");
    const lock = await distributedLocks.acquireRoomLockWithRetry(roomId, ROOM_LOCK_TTL_MS, {
      maxRetries: 10,
      initialDelayMs: 100,
      maxDelayMs: 2000,
    });

    if (!lock) {
      logger.error("[ElizaApp WhatsAppWebhook] Failed to acquire room lock", { roomId });
      return false;
    }

    try {
      const user: UserWithOrganization = { ...userWithOrg, organization };

      const userContext = await userContextService.buildContext({
        user,
        isAnonymous: false,
        agentMode: AgentMode.ASSISTANT,
      });
      userContext.characterId = getDefaultAgentId();
      userContext.webSearchEnabled = true;
      userContext.modelPreferences = elizaAppConfig.modelPreferences;

      logger.info("[ElizaApp WhatsAppWebhook] Processing message", {
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
        typeof responseContent === "string" ? responseContent : responseContent?.text || "";

      perfTrace.mark("send-response");
      if (responseText) {
        const sent = await sendWhatsAppResponse(msg.from, responseText);
        if (!sent) {
          logger.warn("[ElizaApp WhatsAppWebhook] Send failed, allowing webhook retry", {
            to: msg.from,
            roomId,
          });
          return false;
        }
      }

      return true;
    } catch (error) {
      logger.error("[ElizaApp WhatsAppWebhook] Agent failed", {
        error: error instanceof Error ? error.message : String(error),
        roomId,
      });
      return true;
    } finally {
      await lock.release().catch((error) => {
        logger.warn("[ElizaApp WhatsAppWebhook] Failed to release room lock", {
          roomId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  } finally {
    stopTyping();
    perfTrace.end();
  }
}

async function handleWhatsAppWebhookPost(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();
  const skipVerification =
    process.env.SKIP_WEBHOOK_VERIFICATION === "true" && process.env.NODE_ENV !== "production";

  const signatureHeader = request.headers.get("x-hub-signature-256") || "";

  if (!skipVerification) {
    const isValid = whatsAppAuthService.verifyWebhookSignature(signatureHeader, rawBody);

    if (!isValid) {
      logger.warn("[ElizaApp WhatsAppWebhook] Invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else {
    logger.warn("[ElizaApp WhatsAppWebhook] Signature verification skipped (dev mode)");
  }

  let payload;
  try {
    const rawPayload = JSON.parse(rawBody);
    payload = parseWhatsAppWebhookPayload(rawPayload);
  } catch (error) {
    if (error instanceof SyntaxError) {
      logger.warn("[ElizaApp WhatsAppWebhook] Invalid JSON payload");
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (error instanceof ZodError) {
      logger.warn("[ElizaApp WhatsAppWebhook] Invalid payload schema", {
        issues: error.issues,
      });
      return NextResponse.json(
        { error: "Invalid payload", details: error.issues },
        { status: 400 },
      );
    }
    throw error;
  }

  const messages = extractWhatsAppMessages(payload);

  logger.info("[ElizaApp WhatsAppWebhook] Received webhook", {
    messageCount: messages.length,
  });

  let allProcessed = true;
  for (const msg of messages) {
    const idempotencyKey = `whatsapp:eliza-app:${msg.messageId}`;
    const claimed = await tryClaimForProcessing(idempotencyKey, "whatsapp-eliza-app");

    if (!claimed) {
      logger.info("[ElizaApp WhatsAppWebhook] Skipping duplicate", {
        messageId: msg.messageId,
      });
      continue;
    }

    try {
      const processed = await handleIncomingMessage(msg);
      if (!processed) {
        await releaseProcessingClaim(idempotencyKey);
        allProcessed = false;
      }
    } catch (error) {
      logger.error("[ElizaApp WhatsAppWebhook] Failed to process message", {
        messageId: msg.messageId,
        error: error instanceof Error ? error.message : String(error),
      });
      await releaseProcessingClaim(idempotencyKey);
      allProcessed = false;
    }
  }

  if (!allProcessed) {
    return NextResponse.json(
      { success: false, error: "Service temporarily unavailable" },
      { status: 503 },
    );
  }

  return NextResponse.json({ success: true });
}

async function handleWhatsAppWebhookGet(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const verifyToken = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const result = whatsAppAuthService.verifyWebhookSubscription(mode, verifyToken, challenge);

  if (result) {
    return new NextResponse(result, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

export const GET = withRateLimit(handleWhatsAppWebhookGet, RateLimitPresets.STANDARD);
export const POST = withRateLimit(handleWhatsAppWebhookPost, RateLimitPresets.AGGRESSIVE);

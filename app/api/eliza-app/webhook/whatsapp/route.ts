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
import { logger } from "@/lib/utils/logger";
import { RateLimitPresets, withRateLimit } from "@/lib/middleware/rate-limit";
import { elizaAppUserService } from "@/lib/services/eliza-app";
import { whatsAppAuthService } from "@/lib/services/eliza-app/whatsapp-auth";
import type { UserWithOrganization } from "@/lib/types";
import { roomsService } from "@/lib/services/agents/rooms";
import { isAlreadyProcessed, markAsProcessed, removeProcessedMark } from "@/lib/utils/idempotency";
import { generateElizaAppRoomId } from "@/lib/utils/deterministic-uuid";
import {
  parseWhatsAppWebhookPayload,
  extractWhatsAppMessages,
  sendWhatsAppMessage,
  markWhatsAppMessageAsRead,
  startWhatsAppTypingIndicator,
  isValidWhatsAppId,
  type WhatsAppIncomingMessage,
} from "@/lib/utils/whatsapp-api";
import { elizaAppConfig } from "@/lib/services/eliza-app/config";
import { runtimeFactory } from "@/lib/eliza/runtime-factory";
import { createMessageHandler } from "@/lib/eliza/message-handler";
import { userContextService } from "@/lib/eliza/user-context";
import { AgentMode } from "@/lib/eliza/agent-mode-types";
import { distributedLocks } from "@/lib/cache/distributed-locks";
import { createPerfTrace } from "@/lib/utils/perf-trace";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // Extended for ASSISTANT mode multi-step execution

const { defaultAgentId: DEFAULT_AGENT_ID } = elizaAppConfig;
const {
  accessToken: WA_ACCESS_TOKEN,
  phoneNumberId: WA_PHONE_NUMBER_ID,
} = elizaAppConfig.whatsapp;

async function sendWhatsAppResponse(
  to: string,
  text: string,
): Promise<boolean> {
  try {
    const response = await sendWhatsAppMessage(
      WA_ACCESS_TOKEN,
      WA_PHONE_NUMBER_ID,
      to,
      text,
    );

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
  if (!text) return true; // Only handle text messages for now

  // Validate WhatsApp ID format (digits only, 7-15 chars) before use
  if (!isValidWhatsAppId(msg.from)) {
    logger.warn("[ElizaApp WhatsAppWebhook] Invalid WhatsApp ID format, skipping", {
      from: msg.from,
      messageId: msg.messageId,
    });
    return true; // Mark as processed to avoid infinite retries on bad data
  }

  // Mark message as read for better UX (sends blue checkmarks).
  // Uses retry with backoff since the first outbound fetch can fail on cold connections.
  const markRead = async (retries = 2) => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await markWhatsAppMessageAsRead(WA_ACCESS_TOKEN, WA_PHONE_NUMBER_ID, msg.messageId);
        return;
      } catch (err) {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        } else {
          logger.warn("[ElizaApp WhatsAppWebhook] Failed to mark as read after retries", {
            messageId: msg.messageId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  };
  markRead();

  const perfTrace = createPerfTrace("whatsapp-webhook");
  const stopTyping = startWhatsAppTypingIndicator(WA_ACCESS_TOKEN, WA_PHONE_NUMBER_ID, msg.messageId);

  try {
    perfTrace.mark("user-provisioning");
    logger.info("[ElizaApp WhatsAppWebhook] Auto-provisioning user", {
      whatsappId: `***${msg.from.slice(-4)}`,
      profileName: msg.profileName,
    });

    const { user: userWithOrg, organization, isNew } =
      await elizaAppUserService.findOrCreateByWhatsAppId(msg.from, msg.profileName);

    logger.info("[ElizaApp WhatsAppWebhook] User provisioned", {
      userId: userWithOrg.id,
      organizationId: organization.id,
      isNewUser: isNew,
      whatsappId: `***${msg.from.slice(-4)}`,
    });

    const roomId = generateElizaAppRoomId("whatsapp", DEFAULT_AGENT_ID, msg.from);
    const entityId = userWithOrg.id;

    perfTrace.mark("room-setup");
    const existingRoom = await roomsService.getRoomSummary(roomId);
    if (!existingRoom) {
      await roomsService.createRoom({
        id: roomId,
        agentId: DEFAULT_AGENT_ID,
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
      await roomsService.addParticipant(roomId, entityId, DEFAULT_AGENT_ID);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (!errMsg.includes("already") && !errMsg.includes("duplicate") && !errMsg.includes("exists")) {
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
      userContext.characterId = DEFAULT_AGENT_ID;
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
        typeof responseContent === "string"
          ? responseContent
          : responseContent?.text || "";

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
      stopTyping();
      await lock.release();
    }
  } finally {
    stopTyping();
    perfTrace.end();
  }
}

async function handleWhatsAppWebhookPost(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();
  const skipVerification =
    process.env.SKIP_WEBHOOK_VERIFICATION === "true" &&
    process.env.NODE_ENV !== "production";

  // Verify webhook signature (X-Hub-Signature-256)
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

  // Parse the webhook payload
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

  // Extract messages from the webhook payload
  const messages = extractWhatsAppMessages(payload);

  logger.info("[ElizaApp WhatsAppWebhook] Received webhook", {
    messageCount: messages.length,
  });

  // Process each message
  let allProcessed = true;
  for (const msg of messages) {
    const idempotencyKey = `whatsapp:eliza-app:${msg.messageId}`;

    if (await isAlreadyProcessed(idempotencyKey)) {
      logger.info("[ElizaApp WhatsAppWebhook] Skipping duplicate", {
        messageId: msg.messageId,
      });
      continue;
    }

    // Claim the message immediately to prevent race conditions.
    // If two webhook deliveries arrive concurrently, the second one
    // will see the idempotency mark and skip (preventing duplicate processing).
    await markAsProcessed(idempotencyKey, "whatsapp-eliza-app");

    const processed = await handleIncomingMessage(msg);

    if (!processed) {
      // Processing failed (e.g., lock timeout, send failure) -
      // remove the claim so Meta's retry can re-process the message.
      await removeProcessedMark(idempotencyKey);
      allProcessed = false;
    }
  }

  // Return 503 on lock failure to trigger webhook retry from Meta
  if (!allProcessed) {
    return NextResponse.json(
      { success: false, error: "Service temporarily unavailable" },
      { status: 503 },
    );
  }

  return NextResponse.json({ success: true });
}

/**
 * GET handler - Webhook verification handshake from Meta.
 *
 * When registering the webhook URL, Meta sends a GET request with:
 * - hub.mode: "subscribe"
 * - hub.verify_token: The verify token you configured
 * - hub.challenge: A number to echo back
 *
 * Must respond with the challenge value as plain text with 200 status.
 */
async function handleWhatsAppWebhookGet(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const verifyToken = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const result = whatsAppAuthService.verifyWebhookSubscription(mode, verifyToken, challenge);

  if (result) {
    // Must return the challenge as plain text (not JSON) per Meta docs
    return new NextResponse(result, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

export const GET = withRateLimit(handleWhatsAppWebhookGet, RateLimitPresets.STANDARD);
export const POST = withRateLimit(handleWhatsAppWebhookPost, RateLimitPresets.AGGRESSIVE);

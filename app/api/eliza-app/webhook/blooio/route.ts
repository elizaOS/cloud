/**
 * Eliza App - Public Blooio Webhook
 *
 * Receives iMessages from Blooio and routes them to the default Eliza agent.
 * Auto-provisions users on first message based on phone number.
 * Uses ASSISTANT mode for full multi-step action execution.
 *
 * POST /api/eliza-app/webhook/blooio
 */

import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { logger } from "@/lib/utils/logger";
import { RateLimitPresets, withRateLimit } from "@/lib/middleware/rate-limit";
import { elizaAppUserService } from "@/lib/services/eliza-app";
import { roomsService } from "@/lib/services/agents/rooms";
import { isAlreadyProcessed, markAsProcessed } from "@/lib/utils/idempotency";
import { normalizePhoneNumber } from "@/lib/utils/phone-normalization";
import { generateElizaAppRoomId, generateElizaAppEntityId } from "@/lib/utils/deterministic-uuid";
import {
  verifyBlooioSignature,
  parseBlooioWebhookEvent,
  extractBlooioMediaUrls,
  blooioApiRequest,
  type BlooioWebhookEvent,
  type BlooioSendMessageResponse,
} from "@/lib/utils/blooio-api";
import { elizaAppConfig } from "@/lib/services/eliza-app/config";
import { runtimeFactory } from "@/lib/eliza/runtime-factory";
import { createMessageHandler } from "@/lib/eliza/message-handler";
import { userContextService } from "@/lib/eliza/user-context";
import { AgentMode } from "@/lib/eliza/agent-mode-types";
import { distributedLocks } from "@/lib/cache/distributed-locks";
import { v4 as uuidv4 } from "uuid";
import { ContentType } from "@elizaos/core";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // Extended for ASSISTANT mode multi-step execution

const { defaultAgentId: DEFAULT_AGENT_ID } = elizaAppConfig;
const { apiKey: BLOOIO_API_KEY, webhookSecret: WEBHOOK_SECRET, phoneNumber: BLOOIO_PHONE_NUMBER } = elizaAppConfig.blooio;

async function sendBlooioMessage(
  toPhone: string,
  text: string,
  mediaUrls?: string[],
): Promise<boolean> {
  try {
    const response = await blooioApiRequest<BlooioSendMessageResponse>(
      BLOOIO_API_KEY,
      "POST",
      `/chats/${encodeURIComponent(toPhone)}/messages`,
      {
        text,
        attachments: mediaUrls,
      },
      {
        fromNumber: BLOOIO_PHONE_NUMBER,
      },
    );

    logger.info("[ElizaApp BlooioWebhook] Message sent", {
      toPhone,
      messageId: response.message_id,
    });

    return true;
  } catch (error) {
    logger.error("[ElizaApp BlooioWebhook] Failed to send message", {
      toPhone,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function handleIncomingMessage(event: BlooioWebhookEvent): Promise<void> {
  if (!event.sender) return;
  if (event.is_group) return;

  const text = event.text?.trim();
  const mediaUrls = extractBlooioMediaUrls(event.attachments);
  if (!text && mediaUrls.length === 0) return;

  const normalizedPhone = normalizePhoneNumber(event.sender);
  const { user, organization } = await elizaAppUserService.findOrCreateByPhone(normalizedPhone);

  const roomId = generateElizaAppRoomId("imessage", DEFAULT_AGENT_ID, normalizedPhone);
  const entityId = generateElizaAppEntityId("imessage", normalizedPhone);

  const existingRoom = await roomsService.getRoomSummary(roomId);
  if (!existingRoom) {
    await roomsService.createRoom({
      id: roomId,
      agentId: DEFAULT_AGENT_ID,
      entityId,
      source: "blooio",
      type: "DM",
      name: `iMessage: ${normalizedPhone}`,
      metadata: {
        channel: "imessage",
        phoneNumber: normalizedPhone,
        userId: user.id,
        organizationId: organization.id,
      },
    });
    await roomsService.addParticipant(roomId, entityId, DEFAULT_AGENT_ID);
  }

  let fullMessage = text || "";
  if (mediaUrls.length > 0) {
    fullMessage += `\n\n[Attached media: ${mediaUrls.join(", ")}]`;
  }

  // Acquire distributed lock to prevent concurrent message processing
  const lock = await distributedLocks.acquireRoomLockWithRetry(roomId, 60000, {
    maxRetries: 10,
    initialDelayMs: 100,
    maxDelayMs: 2000,
  });

  if (!lock) {
    logger.error("[ElizaApp BlooioWebhook] Failed to acquire room lock", { roomId });
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

    logger.info("[ElizaApp BlooioWebhook] Processing message", {
      userId: user.id,
      roomId,
      mode: "assistant",
    });

    const runtime = await runtimeFactory.createRuntimeForUser(userContext);
    const messageHandler = createMessageHandler(runtime, userContext);

    const result = await messageHandler.process({
      roomId,
      text: fullMessage,
      attachments: mediaUrls.map((url) => ({
        id: uuidv4(),
        url,
        contentType: ContentType.IMAGE,
        title: "Attached image",
      })),
      agentModeConfig: { mode: AgentMode.ASSISTANT },
    });

    const responseContent = result.message.content;
    const responseText =
      typeof responseContent === "string"
        ? responseContent
        : responseContent?.text || "";

    if (responseText) {
      await sendBlooioMessage(normalizedPhone, responseText);
    }
  } catch (error) {
    logger.error("[ElizaApp BlooioWebhook] Agent failed", {
      error: error instanceof Error ? error.message : String(error),
      roomId,
    });
  } finally {
    await lock.release();
  }
}

async function handleBlooioWebhook(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();
  const skipVerification =
    process.env.SKIP_WEBHOOK_VERIFICATION === "true" &&
    process.env.NODE_ENV !== "production";

  if (WEBHOOK_SECRET) {
    const signatureHeader = request.headers.get("X-Blooio-Signature") || "";

    const isValid = await verifyBlooioSignature(
      WEBHOOK_SECRET,
      signatureHeader,
      rawBody,
    );

    if (!isValid) {
      logger.warn("[ElizaApp BlooioWebhook] Invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else if (!skipVerification) {
    if (process.env.NODE_ENV === "production") {
      logger.error("[ElizaApp BlooioWebhook] No webhook secret configured in production");
      return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
    }
  }

  let payload: BlooioWebhookEvent;
  try {
    const rawPayload = JSON.parse(rawBody);
    payload = parseBlooioWebhookEvent(rawPayload);
  } catch (error) {
    if (error instanceof SyntaxError) {
      logger.warn("[ElizaApp BlooioWebhook] Invalid JSON payload");
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (error instanceof ZodError) {
      logger.warn("[ElizaApp BlooioWebhook] Invalid payload schema", {
        issues: error.issues,
      });
      return NextResponse.json(
        { error: "Invalid payload", details: error.issues },
        { status: 400 },
      );
    }
    throw error;
  }

  if (payload.message_id) {
    const idempotencyKey = `blooio:eliza-app:${payload.message_id}`;
    if (await isAlreadyProcessed(idempotencyKey)) {
      return NextResponse.json({ success: true, status: "already_processed" });
    }
  }

  if (payload.event === "message.received") {
    await handleIncomingMessage(payload);
  } else if (payload.event === "message.failed") {
    logger.error("[ElizaApp BlooioWebhook] Delivery failed", { messageId: payload.message_id });
  }

  if (payload.message_id) {
    await markAsProcessed(`blooio:eliza-app:${payload.message_id}`, "blooio-eliza-app");
  }

  return NextResponse.json({ success: true });
}

export const POST = withRateLimit(handleBlooioWebhook, RateLimitPresets.AGGRESSIVE);

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: "ok",
    service: "eliza-app-blooio-webhook",
    phoneNumber: BLOOIO_PHONE_NUMBER,
  });
}

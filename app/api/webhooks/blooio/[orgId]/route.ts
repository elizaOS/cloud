/**
 * Blooio Webhook Handler
 *
 * Receives inbound iMessage/SMS messages from Blooio and routes them
 * to the appropriate agent for processing.
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { blooioAutomationService } from "@/lib/services/blooio-automation";
import { verifyBlooioSignature, type BlooioWebhookEvent } from "@/lib/utils/blooio-api";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { orgId } = await params;

  if (!orgId) {
    return NextResponse.json(
      { error: "Organization ID is required" },
      { status: 400 },
    );
  }

  try {
    // Get raw body for signature verification
    const rawBody = await request.text();

    // Get webhook secret for this organization
    const webhookSecret =
      await blooioAutomationService.getWebhookSecret(orgId);

    // Verify signature if webhook secret is configured
    if (webhookSecret) {
      const signatureHeader = request.headers.get("X-Blooio-Signature") || "";
      const isValid = await verifyBlooioSignature(
        webhookSecret,
        signatureHeader,
        rawBody,
      );

      if (!isValid) {
        logger.warn("[BlooioWebhook] Signature validation failed", { orgId });
        return NextResponse.json(
          { error: "Invalid webhook signature" },
          { status: 401 },
        );
      }
    }

    // Parse the webhook payload
    let payload: BlooioWebhookEvent;
    try {
      payload = JSON.parse(rawBody) as BlooioWebhookEvent;
    } catch {
      logger.warn("[BlooioWebhook] Invalid JSON payload", { orgId });
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    // Log the event
    logger.info("[BlooioWebhook] Received event", {
      orgId,
      event: payload.event,
      messageId: payload.message_id,
      sender: payload.sender,
    });

    // Handle different event types
    switch (payload.event) {
      case "message.received":
        await handleIncomingMessage(orgId, payload);
        break;

      case "message.sent":
        logger.info("[BlooioWebhook] Message sent confirmation", {
          orgId,
          messageId: payload.message_id,
        });
        break;

      case "message.delivered":
        logger.info("[BlooioWebhook] Message delivered", {
          orgId,
          messageId: payload.message_id,
        });
        break;

      case "message.failed":
        logger.error("[BlooioWebhook] Message delivery failed", {
          orgId,
          messageId: payload.message_id,
        });
        break;

      case "message.read":
        logger.info("[BlooioWebhook] Message read", {
          orgId,
          messageId: payload.message_id,
        });
        break;

      default:
        logger.info("[BlooioWebhook] Unhandled event type", {
          orgId,
          event: payload.event,
        });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[BlooioWebhook] Error processing webhook", {
      orgId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * Handle incoming message from Blooio
 */
async function handleIncomingMessage(
  orgId: string,
  event: BlooioWebhookEvent,
): Promise<void> {
  const { messageRouterService } = await import("@/lib/services/message-router");

  const chatId = event.external_id || event.sender;

  if (!chatId) {
    logger.warn("[BlooioWebhook] Message missing chat identifier", { orgId });
    return;
  }

  const text = event.text?.trim();
  const hasAttachments = event.attachments && event.attachments.length > 0;

  if (!text && !hasAttachments) {
    logger.info("[BlooioWebhook] Skipping empty message", { orgId, chatId });
    return;
  }

  logger.info("[BlooioWebhook] Processing incoming message", {
    orgId,
    chatId,
    sender: event.sender,
    hasText: !!text,
    hasAttachments,
    protocol: event.protocol,
  });

  const startTime = Date.now();

  // Extract recipient from event or use chatId
  const recipient = chatId;
  
  // Extract media URLs from attachments
  const extractedMediaUrls = event.attachments?.map((a) => 
    typeof a === "string" ? a : a.url
  );

  // Build message context for routing
  const messageContext = {
    from: event.sender,
    to: recipient,
    body: text || "",
    provider: "blooio" as const,
    providerMessageId: event.message_id,
    mediaUrls: extractedMediaUrls,
    messageType: "imessage" as const,
    metadata: {
      protocol: event.protocol,
      external_id: event.external_id,
      timestamp: event.timestamp,
    },
  };

  // Route to agent
  const routeResult = await messageRouterService.routeIncomingMessage(messageContext);

  if (!routeResult.success || !routeResult.agentId || !routeResult.organizationId) {
    logger.warn("[BlooioWebhook] Failed to route message", {
      orgId,
      error: routeResult.error,
    });
    return;
  }

  // Process the message with the agent
  const agentResponse = await messageRouterService.processWithAgent(
    routeResult.agentId,
    routeResult.organizationId,
    {
      from: event.sender,
      to: recipient,
      body: text || "",
      provider: "blooio",
      providerMessageId: event.message_id,
      mediaUrls: extractedMediaUrls,
      messageType: "imessage",
    },
  );

  if (agentResponse) {
    // Send the response back via Blooio
    const sent = await messageRouterService.sendMessage({
      to: event.sender,
      from: recipient,
      body: agentResponse.text,
      provider: "blooio",
      mediaUrls: agentResponse.mediaUrls,
      organizationId: routeResult.organizationId,
    });

    const responseTime = Date.now() - startTime;

    if (sent) {
      logger.info("[BlooioWebhook] Agent response sent", {
        orgId,
        chatId,
        responseTime,
      });
    } else {
      logger.error("[BlooioWebhook] Failed to send agent response", {
        orgId,
        chatId,
      });
    }
  }
}

// Health check endpoint for the webhook
export async function GET(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { orgId } = await params;

  const isConfigured = await blooioAutomationService.isConfigured(orgId);

  return NextResponse.json({
    status: "ok",
    service: "blooio-webhook",
    organizationId: orgId,
    configured: isConfigured,
  });
}

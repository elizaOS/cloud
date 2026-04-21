/**
 * Organization-Level WhatsApp Webhook Handler
 *
 * Receives incoming messages from WhatsApp Cloud API for a specific
 * organization's WhatsApp Business account. Each organization has
 * their own webhook URL with their orgId.
 *
 * GET  /api/webhooks/whatsapp/[orgId]  -- Meta verification handshake
 * POST /api/webhooks/whatsapp/[orgId]  -- Incoming messages
 */

import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { RateLimitPresets, withRateLimit } from "@/lib/middleware/rate-limit";
import { miladyGatewayRouterService } from "@/lib/services/milady-gateway-router";
import { messageRouterService } from "@/lib/services/message-router";
import { whatsappAutomationService } from "@/lib/services/whatsapp-automation";
import { releaseProcessingClaim, tryClaimForProcessing } from "@/lib/utils/idempotency";
import { logger } from "@/lib/utils/logger";
import { createPerfTrace } from "@/lib/utils/perf-trace";
import {
  extractWhatsAppMessages,
  isValidWhatsAppId,
  markWhatsAppMessageAsRead,
  parseWhatsAppWebhookPayload,
  startWhatsAppTypingIndicator,
  type WhatsAppIncomingMessage,
} from "@/lib/utils/whatsapp-api";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

// ============================================================================
// POST Handler - Incoming Messages
// ============================================================================

async function handleWhatsAppWebhook(
  request: NextRequest,
  context?: RouteParams,
): Promise<Response> {
  const { orgId } = context?.params ? await context.params : { orgId: "" };

  if (!orgId) {
    return NextResponse.json({ error: "Organization ID is required" }, { status: 400 });
  }

  try {
    // Get raw body for signature verification
    const rawBody = await request.text();

    // Verify signature - only skip if explicitly disabled AND not in production
    const isProduction = process.env.NODE_ENV === "production";
    const skipVerification = process.env.SKIP_WEBHOOK_VERIFICATION === "true" && !isProduction;

    if (process.env.SKIP_WEBHOOK_VERIFICATION === "true" && isProduction) {
      logger.error("[WhatsAppWebhook] SKIP_WEBHOOK_VERIFICATION ignored in production", { orgId });
    }

    if (skipVerification) {
      logger.warn("[WhatsAppWebhook] Signature verification disabled (non-production)", { orgId });
    } else {
      const signatureHeader = request.headers.get("x-hub-signature-256") || "";

      const isValid = await whatsappAutomationService.verifyWebhookSignature(
        orgId,
        signatureHeader,
        rawBody,
      );

      if (!isValid) {
        logger.warn("[WhatsAppWebhook] Invalid signature", { orgId });
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    // Parse and validate the webhook payload using Zod schema
    let payload;
    try {
      const rawPayload = JSON.parse(rawBody);
      payload = parseWhatsAppWebhookPayload(rawPayload);
    } catch (parseError) {
      if (parseError instanceof SyntaxError) {
        logger.warn("[WhatsAppWebhook] Invalid JSON payload", { orgId });
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
      }
      if (parseError instanceof ZodError) {
        logger.warn("[WhatsAppWebhook] Invalid payload schema", {
          orgId,
          issues: parseError.issues,
        });
        return NextResponse.json(
          { error: "Invalid payload", details: parseError.issues },
          { status: 400 },
        );
      }
      throw parseError;
    }

    // Extract messages from the webhook payload
    const messages = extractWhatsAppMessages(payload);

    logger.info("[WhatsAppWebhook] Received webhook", {
      orgId,
      messageCount: messages.length,
    });

    // Process each message
    for (const msg of messages) {
      const idempotencyKey = `whatsapp:org:${orgId}:${msg.messageId}`;

      // Atomic claim - prevents duplicate processing across concurrent deliveries
      const claimed = await tryClaimForProcessing(idempotencyKey, "whatsapp-org");
      if (!claimed) {
        logger.info("[WhatsAppWebhook] Skipping duplicate", {
          orgId,
          messageId: msg.messageId,
        });
        continue;
      }

      try {
        await handleIncomingMessage(orgId, msg);
      } catch (error) {
        logger.error("[WhatsAppWebhook] Failed to process message", {
          orgId,
          messageId: msg.messageId,
          error: error instanceof Error ? error.message : String(error),
        });
        // Release claim so the message can be retried
        await releaseProcessingClaim(idempotencyKey);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[WhatsAppWebhook] Error processing webhook", {
      orgId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ============================================================================
// GET Handler - Meta Verification Handshake
// ============================================================================

async function handleWhatsAppVerification(
  request: NextRequest,
  context?: RouteParams,
): Promise<Response> {
  const { orgId } = context?.params ? await context.params : { orgId: "" };

  if (!orgId) {
    return NextResponse.json({ error: "Organization ID is required" }, { status: 400 });
  }

  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const verifyToken = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const result = await whatsappAutomationService.verifyWebhookSubscription(
    orgId,
    mode,
    verifyToken,
    challenge,
  );

  if (result) {
    logger.info("[WhatsAppWebhook] Verification handshake successful", {
      orgId,
    });
    // Must return the challenge as plain text (not JSON) per Meta docs
    return new NextResponse(result, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  logger.warn("[WhatsAppWebhook] Verification handshake failed", { orgId });
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

// ============================================================================
// Message Handling
// ============================================================================

async function handleIncomingMessage(orgId: string, msg: WhatsAppIncomingMessage): Promise<void> {
  const text = msg.text?.trim();
  if (!text) {
    logger.info("[WhatsAppWebhook] Skipping non-text message", {
      orgId,
      type: msg.type,
    });
    return;
  }

  // Validate WhatsApp ID format before use
  if (!isValidWhatsAppId(msg.from)) {
    logger.warn("[WhatsAppWebhook] Invalid WhatsApp ID format", {
      orgId,
      from: msg.from,
    });
    return;
  }

  const perfTrace = createPerfTrace("whatsapp-org-webhook");

  perfTrace.mark("get-credentials");
  const [accessToken, phoneNumberId, businessPhone] = await Promise.all([
    whatsappAutomationService.getAccessToken(orgId),
    whatsappAutomationService.getPhoneNumberId(orgId),
    whatsappAutomationService.getBusinessPhone(orgId),
  ]);

  // Mark message as read for better UX (sends blue checkmarks).
  // Uses retry with backoff since the first outbound fetch can fail on cold connections.
  if (accessToken && phoneNumberId) {
    const markRead = async (retries = 2) => {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          await markWhatsAppMessageAsRead(accessToken, phoneNumberId, msg.messageId);
          return;
        } catch (err) {
          if (attempt < retries) {
            await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          } else {
            logger.warn("[WhatsAppWebhook] Failed to mark as read after retries", {
              orgId,
              messageId: msg.messageId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
    };
    void markRead();
  }

  const stopTyping =
    accessToken && phoneNumberId
      ? startWhatsAppTypingIndicator(accessToken, phoneNumberId, msg.messageId)
      : () => {};

  try {
    logger.info("[WhatsAppWebhook] Processing incoming message", {
      orgId,
      from: `***${msg.from.slice(-4)}`,
      hasText: !!text,
      profileName: msg.profileName,
    });

    const recipient = businessPhone || msg.phoneNumberId;

    perfTrace.mark("route-message");

    const messageContext = {
      from: msg.from,
      to: recipient,
      body: text,
      provider: "whatsapp" as const,
      providerMessageId: msg.messageId,
      messageType: "whatsapp" as const,
      metadata: {
        profileName: msg.profileName,
        timestamp: msg.timestamp,
        phoneNumberId: msg.phoneNumberId,
      },
    };

    const routeResult = await miladyGatewayRouterService.routeWhatsAppMessage({
      organizationId: orgId,
      from: msg.from,
      to: recipient,
      body: text,
      providerMessageId: msg.messageId,
      metadata: {
        profileName: msg.profileName,
        timestamp: msg.timestamp,
        phoneNumberId: msg.phoneNumberId,
      },
      senderName: msg.profileName,
    });

    if (!routeResult.handled || !routeResult.agentId || !routeResult.organizationId) {
      const phoneRouteResult = await messageRouterService.routeIncomingMessage(messageContext);
      if (!phoneRouteResult.success || !phoneRouteResult.agentId || !phoneRouteResult.organizationId) {
        logger.info("[WhatsAppWebhook] Message received (agent routing not configured)", {
          orgId,
          from: `***${msg.from.slice(-4)}`,
          text: text.substring(0, 50),
        });
        return;
      }

      perfTrace.mark("process-with-agent");
      const agentResponse = await messageRouterService.processWithAgent(
        phoneRouteResult.agentId,
        phoneRouteResult.organizationId,
        messageContext,
      );

      if (agentResponse) {
        perfTrace.mark("send-response");
        const sent = await messageRouterService.sendMessage({
          to: msg.from,
          from: recipient,
          body: agentResponse.text,
          provider: "whatsapp",
          mediaUrls: agentResponse.mediaUrls,
          organizationId: phoneRouteResult.organizationId,
        });

        if (sent) {
          logger.info("[WhatsAppWebhook] Agent response sent", {
            orgId,
            to: `***${msg.from.slice(-4)}`,
          });
        } else {
          logger.error("[WhatsAppWebhook] Failed to send agent response", {
            orgId,
            to: `***${msg.from.slice(-4)}`,
          });
        }
      }
      return;
    }

    perfTrace.mark("process-with-agent");
    const replyText = routeResult.replyText?.trim();
    if (!replyText) {
      logger.info("[WhatsAppWebhook] Shared gateway handled message without reply", {
        orgId,
        from: `***${msg.from.slice(-4)}`,
        agentId: routeResult.agentId,
      });
      return;
    }

    const sent = await messageRouterService.sendMessage({
      to: msg.from,
      from: recipient,
      body: replyText,
      provider: "whatsapp",
      mediaUrls: undefined,
      organizationId: routeResult.organizationId,
    });

    if (sent) {
      logger.info("[WhatsAppWebhook] Agent response sent", {
        orgId,
        to: `***${msg.from.slice(-4)}`,
      });
    } else {
      logger.error("[WhatsAppWebhook] Failed to send agent response", {
        orgId,
        to: `***${msg.from.slice(-4)}`,
      });
    }
  } finally {
    stopTyping();
    perfTrace.end();
  }
}

// Export handlers with rate limiting
export const GET = withRateLimit(handleWhatsAppVerification, RateLimitPresets.STANDARD);
export const POST = withRateLimit(handleWhatsAppWebhook, RateLimitPresets.AGGRESSIVE);

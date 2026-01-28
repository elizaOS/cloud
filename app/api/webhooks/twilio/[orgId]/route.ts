/**
 * Twilio SMS Webhook Handler
 *
 * Receives inbound SMS/MMS messages from Twilio and routes them
 * to the appropriate agent for processing.
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { twilioAutomationService } from "@/lib/services/twilio-automation";
import { verifyTwilioSignature, extractMediaUrls, type TwilioWebhookEvent } from "@/lib/utils/twilio-api";

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
    return new NextResponse("Organization ID is required", { status: 400 });
  }

  try {
    // Parse form data from Twilio
    const formData = await request.formData();
    const webhookData: Record<string, string> = {};

    formData.forEach((value, key) => {
      webhookData[key] = value.toString();
    });

    const event = webhookData as unknown as TwilioWebhookEvent;

    // Verify signature if auth token is available (skip in development)
    const isDev = process.env.NODE_ENV === "development";
    const authToken = await twilioAutomationService.getAuthToken(orgId);
    if (authToken && !isDev) {
      const signature = request.headers.get("X-Twilio-Signature") || "";
      const url = request.url;

      const isValid = await verifyTwilioSignature(
        authToken,
        signature,
        url,
        webhookData,
      );

      if (!isValid) {
        logger.warn("[TwilioWebhook] Signature validation failed", { orgId });
        return new NextResponse("Invalid signature", { status: 401 });
      }
    } else if (isDev) {
      logger.info("[TwilioWebhook] Skipping signature validation in development");
    }

    // Log the event
    logger.info("[TwilioWebhook] Received SMS", {
      orgId,
      messageSid: event.MessageSid,
      from: event.From,
      to: event.To,
      hasBody: !!event.Body,
      numMedia: event.NumMedia,
    });

    // Process the incoming message
    await handleIncomingMessage(orgId, event);

    // Return TwiML response (empty response acknowledges receipt)
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        status: 200,
        headers: {
          "Content-Type": "application/xml",
        },
      },
    );
  } catch (error) {
    logger.error("[TwilioWebhook] Error processing webhook", {
      orgId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return new NextResponse("Internal server error", { status: 500 });
  }
}

/**
 * Handle incoming SMS message from Twilio
 */
async function handleIncomingMessage(
  orgId: string,
  event: TwilioWebhookEvent,
): Promise<void> {
  const { messageRouterService } = await import("@/lib/services/message-router");

  const from = event.From;
  const to = event.To;
  const body = event.Body?.trim();
  const mediaUrls = extractMediaUrls(event);

  if (!body && mediaUrls.length === 0) {
    logger.info("[TwilioWebhook] Skipping empty message", { orgId, from });
    return;
  }

  logger.info("[TwilioWebhook] Processing incoming message", {
    orgId,
    from,
    to,
    hasBody: !!body,
    numMedia: mediaUrls.length,
    fromCity: event.FromCity,
    fromState: event.FromState,
    fromCountry: event.FromCountry,
  });

  const startTime = Date.now();

  // Build message context for routing
  const messageContext = {
    from,
    to,
    body: body || "",
    provider: "twilio" as const,
    providerMessageId: event.MessageSid,
    mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
    messageType: (mediaUrls.length > 0 ? "mms" : "sms") as "sms" | "mms",
    metadata: {
      fromCity: event.FromCity,
      fromState: event.FromState,
      fromCountry: event.FromCountry,
      accountSid: event.AccountSid,
    },
  };

  // Route to agent
  const routeResult = await messageRouterService.routeIncomingMessage(messageContext);

  if (!routeResult.success || !routeResult.agentId || !routeResult.organizationId) {
    logger.warn("[TwilioWebhook] Failed to route message", {
      orgId,
      from,
      to,
      error: routeResult.error,
    });
    return;
  }

  // Process the message with the agent
  const agentResponse = await messageRouterService.processWithAgent(
    routeResult.agentId,
    routeResult.organizationId,
    {
      from,
      to,
      body: body || "",
      provider: "twilio",
      providerMessageId: event.MessageSid,
      mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
      messageType: mediaUrls.length > 0 ? "mms" : "sms",
    },
  );

  if (agentResponse) {
    // Send the response back via Twilio
    const sent = await messageRouterService.sendMessage({
      to: from, // Reply to sender
      from: to, // From our number
      body: agentResponse.text,
      provider: "twilio",
      mediaUrls: agentResponse.mediaUrls,
      organizationId: routeResult.organizationId,
    });

    const responseTime = Date.now() - startTime;

    if (sent) {
      logger.info("[TwilioWebhook] Agent response sent", {
        orgId,
        from,
        to,
        responseTime,
      });
    } else {
      logger.error("[TwilioWebhook] Failed to send agent response", {
        orgId,
        from,
        to,
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

  const isConfigured = await twilioAutomationService.isConfigured(orgId);

  return NextResponse.json({
    status: "ok",
    service: "twilio-webhook",
    organizationId: orgId,
    configured: isConfigured,
  });
}

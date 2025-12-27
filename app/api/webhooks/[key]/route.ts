/**
 * Webhook Receiver Endpoint
 *
 * POST /api/webhooks/[key] - Receive webhook calls
 * GET  /api/webhooks/[key] - Webhook info/health check
 *
 * This is the public endpoint that external services call to deliver webhooks.
 * No authentication required - security is provided via signature verification.
 */

import { NextRequest, NextResponse } from "next/server";
import { webhookService } from "@/lib/services/webhooks/webhook-service";
import { logger } from "@/lib/utils/logger";
import {
  verifyWebhookSignature,
  getSignatureFromHeaders,
} from "@/lib/utils/webhook-signature";

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  return forwarded?.split(",")[0]?.trim() || realIp || "unknown";
}

function isIpAllowed(clientIp: string, allowedIps?: string[]): boolean {
  if (!allowedIps || allowedIps.length === 0) return true;
  return allowedIps.includes(clientIp) || allowedIps.includes("*");
}

/**
 * GET /api/webhooks/[key]
 * Webhook info/health check
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ key: string }> },
) {
  const { key } = await ctx.params;

  const webhook = await webhookService.getWebhookByKey(key);

  if (!webhook || !webhook.is_active) {
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 50));
    return NextResponse.json(
      { success: false, error: "Webhook unavailable" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    webhook: {
      id: webhook.id,
      name: webhook.name,
      isActive: webhook.is_active,
      executionCount: webhook.execution_count,
      lastTriggeredAt: webhook.last_triggered_at?.toISOString(),
    },
  });
}

/**
 * POST /api/webhooks/[key]
 * Receive webhook call
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ key: string }> },
) {
  const startTime = Date.now();
  const clientIp = getClientIp(request);
  const { key } = await ctx.params;

  const webhook = await webhookService.getWebhookByKey(key);

  if (!webhook || !webhook.is_active) {
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 50));
    return NextResponse.json(
      { success: false, error: "Webhook unavailable" },
      { status: 404 },
    );
  }

  const config = webhook.config as any;

  if (!isIpAllowed(clientIp, config.allowedIps)) {
    logger.warn("[Webhook Receiver] IP not allowed", {
      webhookId: webhook.id,
      clientIp,
    });
    return NextResponse.json(
      { success: false, error: "IP not allowed" },
      { status: 403 },
    );
  }

  const rawBody = await request.text();

  if (config.requireSignature !== false && webhook.secret) {
    const signature = getSignatureFromHeaders(request.headers);

    if (!signature) {
      logger.warn("[Webhook Receiver] Missing signature", {
        webhookId: webhook.id,
      });
      return NextResponse.json(
        { success: false, error: "Missing webhook signature" },
        { status: 401 },
      );
    }

    const verifyResult = verifyWebhookSignature({
      payload: rawBody,
      signature,
      secret: webhook.secret,
    });

    if (!verifyResult.valid) {
      logger.warn("[Webhook Receiver] Invalid signature", {
        webhookId: webhook.id,
        error: verifyResult.error,
      });
      return NextResponse.json(
        { success: false, error: "Invalid webhook signature" },
        { status: 401 },
      );
    }
  }

  let payload: Record<string, unknown> = {};
  if (rawBody) {
    payload = JSON.parse(rawBody);
  }

  const requestHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    requestHeaders[key] = value;
  });

  const rateLimitOk = await webhookService.checkRateLimit(webhook.id);
  if (!rateLimitOk) {
    logger.warn("[Webhook Receiver] Rate limit exceeded", {
      webhookId: webhook.id,
    });
    return NextResponse.json(
      { success: false, error: "Rate limit exceeded" },
      { status: 429 },
    );
  }

  const result = await webhookService.executeWebhook({
    webhookId: webhook.id,
    payload,
    requestIp: clientIp,
    requestHeaders,
  });

  const duration = Date.now() - startTime;

  logger.info("[Webhook Receiver] Webhook executed", {
    webhookId: webhook.id,
    executionId: result.executionId,
    status: result.status,
    duration,
  });

  return NextResponse.json({
    success: result.status === "success",
    executionId: result.executionId,
    status: result.status,
  });
}


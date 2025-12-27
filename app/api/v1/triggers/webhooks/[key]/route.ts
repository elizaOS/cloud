/**
 * Application Trigger Webhook Endpoint
 *
 * POST /api/v1/triggers/webhooks/:key - Execute trigger via webhook
 * GET /api/v1/triggers/webhooks/:key - Health check
 *
 * Security features:
 * - HMAC signature verification
 * - Rate limiting
 * - Organization validation
 * - Daily execution limits
 */

import { NextRequest, NextResponse } from "next/server";
import { applicationTriggersService } from "@/lib/services/application-triggers";
import { logger } from "@/lib/utils/logger";
import { withRateLimit } from "@/lib/middleware/rate-limit";
import {
  verifyWebhookSignature,
  getSignatureFromHeaders,
} from "@/lib/utils/webhook-signature";

// =============================================================================
// HELPERS
// =============================================================================

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  return forwarded?.split(",")[0]?.trim() || realIp || "unknown";
}

function isIpAllowed(clientIp: string, allowedIps?: string[]): boolean {
  if (!allowedIps || allowedIps.length === 0) return true;
  return allowedIps.includes(clientIp) || allowedIps.includes("*");
}

function webhookError(
  message: string,
  status: number,
  details?: Record<string, unknown>,
): NextResponse {
  if (details) {
    logger.warn(`[App Trigger Webhook] ${message}`, details);
  }
  return NextResponse.json(
    { success: false, error: status === 404 ? "Webhook unavailable" : message },
    { status },
  );
}

// =============================================================================
// POST HANDLER
// =============================================================================

async function handleWebhook(
  request: NextRequest,
  ctx: { params: Promise<{ key: string }> },
): Promise<Response> {
  const startTime = Date.now();
  const clientIp = getClientIp(request);
  const { key } = await ctx.params;

  // Find trigger by key
  const trigger = await applicationTriggersService.findTriggerByKey(key);

  if (!trigger || !trigger.is_active) {
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 50));
    return webhookError("Webhook unavailable", 404, {
      keyPrefix: key.slice(0, 8) + "...",
      reason: !trigger ? "not_found" : "inactive",
      clientIp,
    });
  }

  if (trigger.trigger_type !== "webhook") {
    return webhookError("Invalid trigger type", 400, {
      triggerId: trigger.id,
      actualType: trigger.trigger_type,
    });
  }

  // IP allowlist check
  if (!isIpAllowed(clientIp, trigger.config.allowedIps)) {
    return webhookError("IP not allowed", 403, {
      triggerId: trigger.id,
      clientIp,
    });
  }

  // Get raw body for signature verification
  const rawBody = await request.text();

  // Signature verification
  if (trigger.config.requireSignature && trigger.config.webhookSecret) {
    const signature = getSignatureFromHeaders(request.headers);

    if (!signature) {
      return webhookError("Missing webhook signature", 401, {
        triggerId: trigger.id,
        header: "x-webhook-signature",
      });
    }

    const verifyResult = verifyWebhookSignature({
      payload: rawBody,
      signature,
      secret: trigger.config.webhookSecret,
    });

    if (!verifyResult.valid) {
      return webhookError("Invalid webhook signature", 401, {
        triggerId: trigger.id,
        verifyError: verifyResult.error,
      });
    }
  }

  // Parse input data
  let inputData: Record<string, unknown> = {};
  if (rawBody) {
    try {
      inputData = JSON.parse(rawBody);
    } catch {
      return webhookError("Invalid JSON payload", 400);
    }
  }

  // Execute trigger
  try {
    const result = await applicationTriggersService.executeTrigger(
      trigger.id,
      inputData,
      "webhook",
      {
        ip: clientIp,
        userAgent: request.headers.get("user-agent") || undefined,
      },
    );

    const duration = Date.now() - startTime;

    logger.info("[App Trigger Webhook] Executed", {
      triggerId: trigger.id,
      executionId: result.executionId,
      status: result.status,
      duration,
      clientIp,
      keyPrefix: key.slice(0, 8) + "...",
    });

    return NextResponse.json({
      success: result.status === "success",
      executionId: result.executionId,
      status: result.status,
      ...(result.error && { error: result.error }),
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Execution failed";

    logger.error("[App Trigger Webhook] Failed", {
      triggerId: trigger.id,
      error: errorMessage,
      clientIp,
      keyPrefix: key.slice(0, 8) + "...",
    });

    if (errorMessage.includes("Daily execution limit")) {
      return webhookError("Daily execution limit exceeded", 429, {
        triggerId: trigger.id,
      });
    }
    if (errorMessage.includes("not active")) {
      return webhookError("Organization not active", 403, {
        triggerId: trigger.id,
      });
    }

    return webhookError("Execution failed", 500, {
      triggerId: trigger.id,
      error: errorMessage,
    });
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

const WEBHOOK_RATE_LIMIT = {
  windowMs: 60000,
  maxRequests: process.env.NODE_ENV === "production" ? 60 : 1000,
  keyGenerator: (request: NextRequest) => `app-trigger:${getClientIp(request)}`,
};

export const POST = withRateLimit(handleWebhook, WEBHOOK_RATE_LIMIT);

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ key: string }> },
): Promise<Response> {
  const { key } = await ctx.params;

  const trigger = await applicationTriggersService.findTriggerByKey(key);

  if (!trigger || !trigger.is_active || trigger.trigger_type !== "webhook") {
    return NextResponse.json(
      { success: false, error: "Webhook unavailable" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    active: true,
    name: trigger.name,
    targetType: trigger.target_type,
    requiresSignature: trigger.config.requireSignature ?? true,
  });
}

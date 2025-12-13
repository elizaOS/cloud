/**
 * N8N Workflow Webhook Endpoint
 *
 * POST /api/v1/n8n/webhooks/:key - Trigger workflow via webhook
 * 
 * SECURITY FEATURES:
 * - HMAC signature verification (optional, configurable per trigger)
 * - Rate limiting (60 requests/minute per IP)
 * - Organization validation
 * - Daily execution limits
 * - Credit checks
 * - Safe response (no sensitive data by default)
 * - Replay protection via timestamp validation
 */

import { NextRequest, NextResponse } from "next/server";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import { logger } from "@/lib/utils/logger";
import { withRateLimit } from "@/lib/middleware/rate-limit";
import {
  verifyWebhookSignature,
  getSignatureFromHeaders,
} from "@/lib/utils/webhook-signature";

interface WebhookTriggerConfig {
  webhookSecret?: string;
  requireSignature?: boolean;
  includeOutputInResponse?: boolean;
  maxExecutionsPerDay?: number;
  allowedIps?: string[];
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  return forwarded?.split(",")[0]?.trim() || realIp || "unknown";
}

function isIpAllowed(clientIp: string, allowedIps?: string[]): boolean {
  if (!allowedIps || allowedIps.length === 0) {
    return true; // No restrictions
  }
  return allowedIps.includes(clientIp) || allowedIps.includes("*");
}

/**
 * Create a safe error response that doesn't leak information.
 */
function webhookError(
  message: string,
  status: number,
  details?: Record<string, unknown>
): NextResponse {
  // Log with details, respond without
  if (details) {
    logger.warn(`[N8N Webhooks] ${message}`, details);
  }
  
  // Return generic message to prevent enumeration attacks
  return NextResponse.json(
    { 
      success: false, 
      error: status === 404 ? "Webhook unavailable" : message,
    },
    { status }
  );
}

// =============================================================================
// HANDLER
// =============================================================================

/**
 * POST /api/v1/n8n/webhooks/:key
 * Triggers a workflow via webhook with security validation.
 */
async function handleWebhook(
  request: NextRequest,
  ctx: { params: Promise<{ key: string }> }
): Promise<Response> {
  const startTime = Date.now();
  const clientIp = getClientIp(request);
  
  const { key } = await ctx.params;

  // Find trigger by key
  const trigger = await n8nWorkflowsService.findTriggerByKey(key);
  
  // SECURITY: Return same response for "not found" and "inactive" 
  // to prevent enumeration attacks
  if (!trigger || !trigger.is_active) {
    // Add small random delay to prevent timing attacks
    await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
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

  const config = trigger.config as WebhookTriggerConfig;

  // SECURITY: IP allowlist check
  if (!isIpAllowed(clientIp, config.allowedIps)) {
    return webhookError("IP not allowed", 403, {
      triggerId: trigger.id,
      clientIp,
      allowedCount: config.allowedIps?.length,
    });
  }

  // Get raw body for signature verification
  const rawBody = await request.text();

  // SECURITY: Signature verification (if required)
  if (config.requireSignature && config.webhookSecret) {
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
      secret: config.webhookSecret,
    });

    if (!verifyResult.valid) {
      return webhookError("Invalid webhook signature", 401, {
        triggerId: trigger.id,
        verifyError: verifyResult.error,
        timestamp: verifyResult.timestamp,
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

  // Execute workflow via trigger (includes org/credit validation)
  try {
    const execution = await n8nWorkflowsService.executeWorkflowTrigger(
      trigger.id,
      inputData
    );

    const duration = Date.now() - startTime;

    logger.info(`[N8N Webhooks] Webhook executed`, {
      triggerId: trigger.id,
      workflowId: trigger.workflow_id,
      executionId: execution.id,
      organizationId: trigger.organization_id,
      duration,
      clientIp,
      keyPrefix: key.slice(0, 8) + "...",
    });

    // SECURITY: Don't include output data by default (may contain secrets)
    const response: Record<string, unknown> = {
      success: true,
      executionId: execution.id,
      status: execution.status,
    };

    // Only include output if explicitly configured
    if (config.includeOutputInResponse && execution.output_data) {
      response.outputData = execution.output_data;
    }

    return NextResponse.json(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Execution failed";
    
    logger.error(`[N8N Webhooks] Execution failed`, {
      triggerId: trigger.id,
      workflowId: trigger.workflow_id,
      error: errorMessage,
      clientIp,
      keyPrefix: key.slice(0, 8) + "...",
    });

    // Check for specific error types
    if (errorMessage.includes("Insufficient credits")) {
      return webhookError("Insufficient credits", 402, { triggerId: trigger.id });
    }
    if (errorMessage.includes("daily execution limit")) {
      return webhookError("Daily execution limit exceeded", 429, { triggerId: trigger.id });
    }
    if (errorMessage.includes("Organization")) {
      return webhookError("Organization not active", 403, { triggerId: trigger.id });
    }

    return webhookError("Workflow execution failed", 500, {
      triggerId: trigger.id,
      error: errorMessage,
    });
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

// Rate limit: 60 requests per minute per IP for webhooks
const WEBHOOK_RATE_LIMIT = {
  windowMs: 60000, // 1 minute
  maxRequests: process.env.NODE_ENV === "production" ? 60 : 1000,
  keyGenerator: (request: NextRequest) => {
    return `webhook:${getClientIp(request)}`;
  },
};

export const POST = withRateLimit(handleWebhook, WEBHOOK_RATE_LIMIT);

// Also support GET for health checks / webhook validation
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ key: string }> }
): Promise<Response> {
  const { key } = await ctx.params;
  
  // Just verify the webhook exists and is active
  const trigger = await n8nWorkflowsService.findTriggerByKey(key);
  
  if (!trigger || !trigger.is_active || trigger.trigger_type !== "webhook") {
    return NextResponse.json(
      { success: false, error: "Webhook unavailable" },
      { status: 404 }
    );
  }

  // Return minimal info for validation
  return NextResponse.json({
    success: true,
    active: true,
    requiresSignature: (trigger.config as WebhookTriggerConfig).requireSignature ?? true,
  });
}

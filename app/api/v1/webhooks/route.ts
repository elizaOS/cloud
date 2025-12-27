/**
 * Webhooks API
 *
 * GET  /api/v1/webhooks - List webhooks
 * POST /api/v1/webhooks - Create webhook
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { webhookService } from "@/lib/services/webhooks/webhook-service";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

const createWebhookSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  targetType: z.enum(["url", "agent", "application", "workflow", "a2a", "mcp"]),
  targetId: z.string().uuid().optional(),
  targetUrl: z.string().url().optional(),
  config: z
    .object({
      requireSignature: z.boolean().optional(),
      allowedIps: z.array(z.string()).optional(),
      allowedMethods: z
        .array(z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]))
        .optional(),
      eventTypes: z.array(z.string()).optional(),
      eventFilters: z.record(z.unknown()).optional(),
      timeoutSeconds: z.number().int().min(1).max(300).optional(),
      retryCount: z.number().int().min(0).max(10).optional(),
      retryDelayMs: z.number().int().min(100).max(60000).optional(),
      maxExecutionsPerDay: z.number().int().min(1).max(1000000).optional(),
      cronExpression: z.string().optional(),
      cronTimezone: z.string().optional(),
      headers: z.record(z.string()).optional(),
    })
    .optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * GET /api/v1/webhooks
 * List webhooks for the authenticated organization
 */
export async function GET(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  if (!user.organization_id) {
    return NextResponse.json(
      { success: false, error: "Organization required" },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const targetType = searchParams.get("targetType");
  const targetId = searchParams.get("targetId");
  const isActive = searchParams.get("isActive");
  const limit = parseInt(searchParams.get("limit") || "100", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  const webhooks = await webhookService.listWebhooks(user.organization_id, {
    targetType: targetType as any,
    targetId: targetId || undefined,
    isActive: isActive ? isActive === "true" : undefined,
    limit,
    offset,
  });

  return NextResponse.json({
    success: true,
    data: webhooks,
    count: webhooks.length,
  });
}

/**
 * POST /api/v1/webhooks
 * Create a new webhook
 */
export async function POST(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  if (!user.organization_id) {
    return NextResponse.json(
      { success: false, error: "Organization required" },
      { status: 403 },
    );
  }

  const body = await request.json();
  const validation = createWebhookSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid request",
        details: validation.error.format(),
      },
      { status: 400 },
    );
  }

  const data = validation.data;

  if (data.targetType === "url" && !data.targetUrl) {
    return NextResponse.json(
      { success: false, error: "targetUrl is required for url target type" },
      { status: 400 },
    );
  }

  if (data.targetType !== "url" && !data.targetId) {
    return NextResponse.json(
      { success: false, error: "targetId is required for non-url target types" },
      { status: 400 },
    );
  }

  const webhook = await webhookService.createWebhook({
    organizationId: user.organization_id,
    createdBy: user.id,
    name: data.name,
    description: data.description,
    targetType: data.targetType,
    targetId: data.targetId,
    targetUrl: data.targetUrl,
    config: data.config,
    metadata: data.metadata,
  });

  logger.info("[Webhooks API] Created webhook", {
    webhookId: webhook.id,
    organizationId: user.organization_id,
  });

  return NextResponse.json(
    {
      success: true,
      data: webhook,
    },
    { status: 201 },
  );
}


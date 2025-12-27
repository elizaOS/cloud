/**
 * Individual Webhook API
 *
 * GET    /api/v1/webhooks/[id] - Get webhook details
 * PUT    /api/v1/webhooks/[id] - Update webhook
 * DELETE /api/v1/webhooks/[id] - Delete webhook
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { webhookService } from "@/lib/services/webhooks/webhook-service";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

const updateWebhookSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
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
  isActive: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * GET /api/v1/webhooks/[id]
 * Get webhook details
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await ctx.params;

  if (!user.organization_id) {
    return NextResponse.json(
      { success: false, error: "Organization required" },
      { status: 403 },
    );
  }

  const webhook = await webhookService.getWebhookById(id, user.organization_id);

  if (!webhook) {
    return NextResponse.json(
      { success: false, error: "Webhook not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    data: webhook,
  });
}

/**
 * PUT /api/v1/webhooks/[id]
 * Update webhook
 */
export async function PUT(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await ctx.params;

  if (!user.organization_id) {
    return NextResponse.json(
      { success: false, error: "Organization required" },
      { status: 403 },
    );
  }

  const body = await request.json();
  const validation = updateWebhookSchema.safeParse(body);

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

  const webhook = await webhookService.updateWebhook(
    id,
    user.organization_id,
    validation.data,
  );

  logger.info("[Webhooks API] Updated webhook", {
    webhookId: id,
    organizationId: user.organization_id,
  });

  return NextResponse.json({
    success: true,
    data: webhook,
  });
}

/**
 * DELETE /api/v1/webhooks/[id]
 * Delete webhook
 */
export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await ctx.params;

  if (!user.organization_id) {
    return NextResponse.json(
      { success: false, error: "Organization required" },
      { status: 403 },
    );
  }

  await webhookService.deleteWebhook(id, user.organization_id);

  logger.info("[Webhooks API] Deleted webhook", {
    webhookId: id,
    organizationId: user.organization_id,
  });

  return NextResponse.json({
    success: true,
  });
}


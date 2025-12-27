/**
 * Webhook Trigger API
 *
 * POST /api/v1/webhooks/[id]/trigger - Manually trigger webhook
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { webhookService } from "@/lib/services/webhooks/webhook-service";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

const triggerWebhookSchema = z.object({
  eventType: z.string().optional(),
  payload: z.record(z.unknown()),
});

/**
 * POST /api/v1/webhooks/[id]/trigger
 * Manually trigger webhook
 */
export async function POST(
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

  const rateLimitOk = await webhookService.checkRateLimit(id);
  if (!rateLimitOk) {
    return NextResponse.json(
      { success: false, error: "Rate limit exceeded" },
      { status: 429 },
    );
  }

  const body = await request.json();
  const validation = triggerWebhookSchema.safeParse(body);

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

  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const requestHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    requestHeaders[key] = value;
  });

  const result = await webhookService.executeWebhook({
    webhookId: id,
    eventType: validation.data.eventType,
    payload: validation.data.payload,
    requestIp: clientIp,
    requestHeaders,
  });

  logger.info("[Webhooks API] Triggered webhook", {
    webhookId: id,
    executionId: result.executionId,
    status: result.status,
    organizationId: user.organization_id,
  });

  return NextResponse.json({
    success: true,
    data: result,
  });
}


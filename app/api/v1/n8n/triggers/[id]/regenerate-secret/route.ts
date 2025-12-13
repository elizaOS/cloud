/**
 * N8N Workflow Trigger Secret Regeneration API
 *
 * POST /api/v1/n8n/triggers/:id/regenerate-secret - Regenerate webhook secret
 * 
 * Use this endpoint if a webhook secret is compromised.
 * The old secret will immediately stop working.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import { logger } from "@/lib/utils/logger";

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id: triggerId } = await ctx.params;

  const result = await n8nWorkflowsService.regenerateWebhookSecret(
    triggerId,
    user.organization_id
  );

  logger.info(`[N8N Triggers] Webhook secret regenerated`, {
    triggerId,
    userId: user.id,
    organizationId: user.organization_id,
  });

  // Return the new secret (only shown once!)
  return NextResponse.json({
    success: true,
    message: "Webhook secret regenerated. Save this secret - it will only be shown once.",
    webhookSecret: result.webhookSecret,
  });
}


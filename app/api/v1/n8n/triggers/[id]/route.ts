/**
 * N8N Workflow Individual Trigger API
 *
 * GET    /api/v1/n8n/triggers/:id - Get trigger details
 * PATCH  /api/v1/n8n/triggers/:id - Update trigger (enable/disable, config)
 * DELETE /api/v1/n8n/triggers/:id - Delete trigger
 * POST   /api/v1/n8n/triggers/:id/regenerate-secret - Regenerate webhook secret
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

// =============================================================================
// SCHEMAS
// =============================================================================

const UpdateTriggerSchema = z.object({
  isActive: z.boolean().optional(),
  config: z.object({
    // Cron config
    cronExpression: z.string().optional(),
    inputData: z.record(z.unknown()).optional(),
    
    // Webhook config (webhookSecret cannot be updated directly)
    requireSignature: z.boolean().optional(),
    includeOutputInResponse: z.boolean().optional(),
    allowedIps: z.array(z.string()).optional(),
    
    // Limits
    maxExecutionsPerDay: z.number().int().positive().max(100000).optional(),
    estimatedCostPerExecution: z.number().min(0).max(100).optional(),
  }).optional(),
});

// =============================================================================
// HANDLERS
// =============================================================================

/**
 * GET /api/v1/n8n/triggers/:id
 * Get details of a specific trigger.
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id: triggerId } = await ctx.params;

  const trigger = await n8nWorkflowsService.getTrigger(triggerId);
  
  if (!trigger) {
    return NextResponse.json(
      { success: false, error: "Trigger not found" },
      { status: 404 }
    );
  }

  // SECURITY: Verify organization ownership
  if (trigger.organization_id !== user.organization_id) {
    return NextResponse.json(
      { success: false, error: "Trigger not found" },
      { status: 404 }
    );
  }

  // SECURITY: Don't expose webhook secret in response
  const safeConfig = { ...trigger.config };
  if (safeConfig.webhookSecret) {
    safeConfig.webhookSecret = "[REDACTED]";
    safeConfig.hasWebhookSecret = true;
  }

  // Generate webhook URL for webhook triggers
  let webhookUrl: string | undefined;
  if (trigger.trigger_type === "webhook") {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";
    webhookUrl = `${baseUrl}/api/v1/n8n/webhooks/${trigger.trigger_key}`;
  }

  return NextResponse.json({
    success: true,
    trigger: {
      id: trigger.id,
      workflowId: trigger.workflow_id,
      organizationId: trigger.organization_id,
      triggerType: trigger.trigger_type,
      triggerKey: trigger.trigger_key,
      config: safeConfig,
      isActive: trigger.is_active,
      lastExecutedAt: trigger.last_executed_at,
      executionCount: trigger.execution_count,
      errorCount: trigger.error_count,
      createdAt: trigger.created_at,
      updatedAt: trigger.updated_at,
      webhookUrl,
    },
  });
}

/**
 * PATCH /api/v1/n8n/triggers/:id
 * Update a trigger (enable/disable, change configuration).
 */
export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id: triggerId } = await ctx.params;

  if (!user.organization_id) {
    return NextResponse.json(
      { success: false, error: "User has no organization" },
      { status: 400 }
    );
  }

  const body = await request.json();
  const validation = UpdateTriggerSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid request",
        details: validation.error.format(),
      },
      { status: 400 }
    );
  }

  const { isActive, config } = validation.data;

  // Check if at least one field is being updated
  if (isActive === undefined && config === undefined) {
    return NextResponse.json(
      { success: false, error: "No fields to update" },
      { status: 400 }
    );
  }

  const updated = await n8nWorkflowsService.updateTrigger(
    triggerId,
    user.organization_id,
    { isActive, config }
  );

  logger.info(`[N8N Triggers] Trigger updated`, {
    triggerId,
    userId: user.id,
    organizationId: user.organization_id,
    isActive: updated.is_active,
  });

  // Generate webhook URL for webhook triggers
  let webhookUrl: string | undefined;
  if (updated.trigger_type === "webhook") {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";
    webhookUrl = `${baseUrl}/api/v1/n8n/webhooks/${updated.trigger_key}`;
  }

  // SECURITY: Don't expose webhook secret
  const safeConfig = { ...updated.config };
  if (safeConfig.webhookSecret) {
    safeConfig.webhookSecret = "[REDACTED]";
    safeConfig.hasWebhookSecret = true;
  }

  return NextResponse.json({
    success: true,
    trigger: {
      id: updated.id,
      workflowId: updated.workflow_id,
      triggerType: updated.trigger_type,
      triggerKey: updated.trigger_key,
      config: safeConfig,
      isActive: updated.is_active,
      webhookUrl,
      updatedAt: updated.updated_at,
    },
  });
}

/**
 * DELETE /api/v1/n8n/triggers/:id
 * Delete a trigger.
 */
export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id: triggerId } = await ctx.params;

  if (!user.organization_id) {
    return NextResponse.json(
      { success: false, error: "User has no organization" },
      { status: 400 }
    );
  }

  await n8nWorkflowsService.deleteTrigger(triggerId, user.organization_id);

  logger.info(`[N8N Triggers] Trigger deleted`, {
    triggerId,
    userId: user.id,
    organizationId: user.organization_id,
  });

  return NextResponse.json({
    success: true,
    message: "Trigger deleted successfully",
  });
}


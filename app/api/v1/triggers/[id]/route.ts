/**
 * Individual Application Trigger API
 *
 * GET /api/v1/triggers/:id - Get trigger details
 * PATCH /api/v1/triggers/:id - Update trigger
 * DELETE /api/v1/triggers/:id - Delete trigger
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/api/utils";
import { applicationTriggersService } from "@/lib/services/application-triggers";

// =============================================================================
// SCHEMAS
// =============================================================================

const UpdateTriggerSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
  config: z
    .object({
      cronExpression: z.string().optional(),
      timezone: z.string().optional(),
      eventTypes: z.array(z.string()).optional(),
      maxExecutionsPerDay: z.number().positive().optional(),
      timeout: z.number().positive().optional(),
      requireSignature: z.boolean().optional(),
      allowedIps: z.array(z.string()).optional(),
    })
    .optional(),
  actionConfig: z
    .object({
      endpoint: z.string().optional(),
      method: z.enum(["GET", "POST", "PUT", "DELETE"]).optional(),
      workflowId: z.string().uuid().optional(),
      notificationChannels: z.array(z.string()).optional(),
    })
    .optional(),
});

// =============================================================================
// GET /api/v1/triggers/:id
// =============================================================================

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await ctx.params;

  const trigger = await applicationTriggersService.getTrigger(id);

  if (!trigger) {
    return NextResponse.json(
      { success: false, error: "Trigger not found" },
      { status: 404 },
    );
  }

  if (trigger.organization_id !== user.organization_id) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 403 },
    );
  }

  // Get recent executions
  const executions = await applicationTriggersService.getExecutions(id, 10);

  return NextResponse.json({
    success: true,
    trigger: {
      id: trigger.id,
      targetType: trigger.target_type,
      targetId: trigger.target_id,
      triggerType: trigger.trigger_type,
      triggerKey:
        trigger.trigger_type === "webhook"
          ? trigger.trigger_key.slice(0, 8) + "..."
          : trigger.trigger_key,
      name: trigger.name,
      description: trigger.description,
      config: {
        ...trigger.config,
        webhookSecret: trigger.config.webhookSecret ? "[REDACTED]" : undefined,
        hasWebhookSecret: !!trigger.config.webhookSecret,
      },
      actionType: trigger.action_type,
      actionConfig: trigger.action_config,
      isActive: trigger.is_active,
      executionCount: trigger.execution_count,
      errorCount: trigger.error_count,
      lastExecutedAt: trigger.last_executed_at?.toISOString() || null,
      lastErrorAt: trigger.last_error_at?.toISOString() || null,
      lastErrorMessage: trigger.last_error_message,
      createdAt: trigger.created_at.toISOString(),
      updatedAt: trigger.updated_at.toISOString(),
    },
    recentExecutions: executions.map((e) => ({
      id: e.id,
      executionType: e.execution_type,
      status: e.status,
      durationMs: e.duration_ms,
      error: e.error_message,
      createdAt: e.created_at.toISOString(),
    })),
    webhookUrl:
      trigger.trigger_type === "webhook"
        ? `${process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai"}/api/v1/triggers/webhooks/${trigger.trigger_key}`
        : undefined,
  });
}

// =============================================================================
// PATCH /api/v1/triggers/:id
// =============================================================================

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await ctx.params;

  const trigger = await applicationTriggersService.getTrigger(id);

  if (!trigger) {
    return NextResponse.json(
      { success: false, error: "Trigger not found" },
      { status: 404 },
    );
  }

  if (trigger.organization_id !== user.organization_id) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 403 },
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
      { status: 400 },
    );
  }

  const { name, description, isActive, config, actionConfig } = validation.data;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (isActive !== undefined) updates.is_active = isActive;
  if (config) {
    updates.config = { ...trigger.config, ...config };
  }
  if (actionConfig) {
    updates.action_config = { ...trigger.action_config, ...actionConfig };
  }

  const updated = await applicationTriggersService.updateTrigger(id, updates);

  return NextResponse.json({
    success: true,
    trigger: {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      isActive: updated.is_active,
      config: {
        ...updated.config,
        webhookSecret: updated.config.webhookSecret ? "[REDACTED]" : undefined,
        hasWebhookSecret: !!updated.config.webhookSecret,
      },
      actionConfig: updated.action_config,
      updatedAt: updated.updated_at.toISOString(),
    },
  });
}

// =============================================================================
// DELETE /api/v1/triggers/:id
// =============================================================================

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await ctx.params;

  const trigger = await applicationTriggersService.getTrigger(id);

  if (!trigger) {
    return NextResponse.json(
      { success: false, error: "Trigger not found" },
      { status: 404 },
    );
  }

  if (trigger.organization_id !== user.organization_id) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 403 },
    );
  }

  await applicationTriggersService.deleteTrigger(id);

  return NextResponse.json({
    success: true,
    message: "Trigger deleted",
  });
}

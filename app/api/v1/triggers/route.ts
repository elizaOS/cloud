/**
 * Application Triggers API
 * 
 * Manage triggers for apps, agents, and MCPs.
 * 
 * GET /api/v1/triggers - List triggers
 * POST /api/v1/triggers - Create trigger
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/api/utils";
import { applicationTriggersService } from "@/lib/services/application-triggers";

// =============================================================================
// SCHEMAS
// =============================================================================

const CreateTriggerSchema = z.object({
  targetType: z.enum(["fragment_project", "container", "user_mcp"]),
  targetId: z.string().uuid(),
  triggerType: z.enum(["cron", "webhook", "event"]),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  config: z.object({
    cronExpression: z.string().optional(),
    timezone: z.string().optional(),
    eventTypes: z.array(z.string()).optional(),
    maxExecutionsPerDay: z.number().positive().optional(),
    timeout: z.number().positive().optional(),
    requireSignature: z.boolean().optional(),
    allowedIps: z.array(z.string()).optional(),
  }).optional(),
  actionType: z.enum(["call_endpoint", "restart", "execute_workflow", "notify"]).optional(),
  actionConfig: z.object({
    endpoint: z.string().optional(),
    method: z.enum(["GET", "POST", "PUT", "DELETE"]).optional(),
    workflowId: z.string().uuid().optional(),
    notificationChannels: z.array(z.string()).optional(),
  }).optional(),
});

const ListTriggersSchema = z.object({
  targetType: z.enum(["fragment_project", "container", "user_mcp"]).optional(),
  targetId: z.string().uuid().optional(),
  triggerType: z.enum(["cron", "webhook", "event"]).optional(),
  isActive: z.enum(["true", "false"]).optional(),
});

// =============================================================================
// GET /api/v1/triggers
// =============================================================================

export async function GET(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const searchParams = request.nextUrl.searchParams;
  const params = {
    targetType: searchParams.get("targetType") || undefined,
    targetId: searchParams.get("targetId") || undefined,
    triggerType: searchParams.get("triggerType") || undefined,
    isActive: searchParams.get("isActive") || undefined,
  };

  const validation = ListTriggersSchema.safeParse(params);
  if (!validation.success) {
    return NextResponse.json(
      { success: false, error: "Invalid parameters", details: validation.error.format() },
      { status: 400 }
    );
  }

  const { targetType, targetId, triggerType, isActive } = validation.data;

  let triggers;
  if (targetId && targetType) {
    triggers = await applicationTriggersService.listTriggersByTarget(targetType, targetId);
    // Filter to only show triggers for the user's organization
    triggers = triggers.filter(t => t.organization_id === user.organization_id);
  } else {
    triggers = await applicationTriggersService.listTriggersByOrganization(
      user.organization_id,
      {
        targetType: targetType as "fragment_project" | "container" | "user_mcp" | undefined,
        triggerType: triggerType as "cron" | "webhook" | "event" | undefined,
        isActive: isActive === "true" ? true : isActive === "false" ? false : undefined,
      }
    );
  }

  // Redact webhook secrets
  const safeTriggers = triggers.map(t => ({
    id: t.id,
    targetType: t.target_type,
    targetId: t.target_id,
    triggerType: t.trigger_type,
    triggerKey: t.trigger_type === "webhook" ? t.trigger_key.slice(0, 8) + "..." : t.trigger_key,
    name: t.name,
    description: t.description,
    config: {
      ...t.config,
      webhookSecret: t.config.webhookSecret ? "[REDACTED]" : undefined,
      hasWebhookSecret: !!t.config.webhookSecret,
    },
    actionType: t.action_type,
    actionConfig: t.action_config,
    isActive: t.is_active,
    executionCount: t.execution_count,
    errorCount: t.error_count,
    lastExecutedAt: t.last_executed_at?.toISOString() || null,
    createdAt: t.created_at.toISOString(),
    updatedAt: t.updated_at.toISOString(),
  }));

  return NextResponse.json({
    success: true,
    triggers: safeTriggers,
    total: safeTriggers.length,
  });
}

// =============================================================================
// POST /api/v1/triggers
// =============================================================================

export async function POST(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const body = await request.json();
  const validation = CreateTriggerSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      { success: false, error: "Invalid request", details: validation.error.format() },
      { status: 400 }
    );
  }

  const { targetType, targetId, triggerType, name, description, config, actionType, actionConfig } = validation.data;

  // Validate cron expression
  if (triggerType === "cron" && !config?.cronExpression) {
    return NextResponse.json(
      { success: false, error: "cronExpression is required for cron triggers" },
      { status: 400 }
    );
  }

  // Validate event types
  if (triggerType === "event" && (!config?.eventTypes || config.eventTypes.length === 0)) {
    return NextResponse.json(
      { success: false, error: "eventTypes is required for event triggers" },
      { status: 400 }
    );
  }

  const trigger = await applicationTriggersService.createTrigger({
    organizationId: user.organization_id,
    createdBy: user.id,
    targetType,
    targetId,
    triggerType,
    name,
    description,
    config,
    actionType,
    actionConfig,
  });

  // Build response
  const response: Record<string, unknown> = {
    success: true,
    trigger: {
      id: trigger.id,
      targetType: trigger.target_type,
      targetId: trigger.target_id,
      triggerType: trigger.trigger_type,
      triggerKey: trigger.trigger_key,
      name: trigger.name,
      description: trigger.description,
      config: {
        ...trigger.config,
        webhookSecret: undefined, // Will be returned separately
        hasWebhookSecret: !!trigger.config.webhookSecret,
      },
      actionType: trigger.action_type,
      actionConfig: trigger.action_config,
      isActive: trigger.is_active,
      createdAt: trigger.created_at.toISOString(),
    },
  };

  // Include webhook URL and secret for webhook triggers (shown once)
  if (triggerType === "webhook") {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";
    response.webhookUrl = `${baseUrl}/api/v1/triggers/webhooks/${trigger.trigger_key}`;
    response.webhookSecret = {
      value: trigger.config.webhookSecret,
      warning: "Save this secret now - it will not be shown again!",
    };
  }

  return NextResponse.json(response);
}


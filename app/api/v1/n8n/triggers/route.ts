/**
 * N8N Workflow Triggers API
 *
 * GET /api/v1/n8n/triggers?workflowId=xxx - List triggers for a workflow
 * POST /api/v1/n8n/triggers - Create a trigger
 * 
 * SECURITY NOTES:
 * - Webhook secrets are auto-generated and returned only on creation
 * - Signature verification is enabled by default for webhooks
 * - Organization ownership is verified for all operations
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import { z } from "zod";

// Helper to redact secrets from config
function redactConfig(config: Record<string, unknown>): Record<string, unknown> {
  const safe = { ...config };
  if (safe.webhookSecret) {
    delete safe.webhookSecret;
    safe.hasWebhookSecret = true;
  }
  return safe;
}

const CreateTriggerSchema = z.object({
  workflowId: z.string().uuid(),
  triggerType: z.enum(["cron", "webhook", "a2a", "mcp"]),
  triggerKey: z.string().min(1).optional(), // Optional - auto-generated if not provided
  config: z.object({
    // Cron config
    cronExpression: z.string().optional(),
    inputData: z.record(z.unknown()).optional(),
    
    // Webhook config
    requireSignature: z.boolean().optional().default(true),
    includeOutputInResponse: z.boolean().optional().default(false),
    allowedIps: z.array(z.string()).optional(),
    
    // Limits
    maxExecutionsPerDay: z.number().int().positive().max(100000).optional(),
    estimatedCostPerExecution: z.number().min(0).max(100).optional(),
    
    // Allow additional properties
  }).passthrough().optional().default({}),
});

/**
 * GET /api/v1/n8n/triggers
 * Lists triggers for a workflow.
 */
export async function GET(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const workflowId = request.nextUrl.searchParams.get("workflowId");

  if (!workflowId) {
    return NextResponse.json(
      { success: false, error: "workflowId parameter required" },
      { status: 400 }
    );
  }

  // Verify workflow belongs to organization
  const workflow = await n8nWorkflowsService.getWorkflow(workflowId);
  if (!workflow || workflow.organization_id !== user.organization_id) {
    return NextResponse.json(
      { success: false, error: "Workflow not found" },
      { status: 404 }
    );
  }

  const triggers = await n8nWorkflowsService.listTriggers(workflowId);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";
  
  return NextResponse.json({
    success: true,
    triggers: triggers.map((t) => ({
      id: t.id,
      workflowId: t.workflow_id,
      organizationId: t.organization_id,
      triggerType: t.trigger_type,
      triggerKey: t.trigger_key,
      config: redactConfig(t.config),
      isActive: t.is_active,
      lastExecutedAt: t.last_executed_at,
      executionCount: t.execution_count,
      errorCount: t.error_count,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
      // Include webhook URL for convenience
      webhookUrl: t.trigger_type === "webhook" 
        ? `${baseUrl}/api/v1/n8n/webhooks/${t.trigger_key}`
        : undefined,
    })),
  });
}

/**
 * POST /api/v1/n8n/triggers
 * Creates a new trigger.
 */
export async function POST(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  if (!user.organization_id) {
    return NextResponse.json(
      { success: false, error: "User has no organization" },
      { status: 400 }
    );
  }

  const body = await request.json();
  const validation = CreateTriggerSchema.safeParse(body);

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

  const { workflowId, triggerType, triggerKey, config } = validation.data;

  // Verify workflow belongs to organization
  const workflow = await n8nWorkflowsService.getWorkflow(workflowId);
  if (!workflow || workflow.organization_id !== user.organization_id) {
    return NextResponse.json(
      { success: false, error: "Workflow not found" },
      { status: 404 }
    );
  }

  // Validate cron expression if cron trigger
  if (triggerType === "cron" && !config.cronExpression) {
    return NextResponse.json(
      { success: false, error: "cronExpression required for cron triggers" },
      { status: 400 }
    );
  }

  const trigger = await n8nWorkflowsService.createTrigger(
    workflowId,
    triggerType,
    triggerKey,
    config
  );

  // Generate webhook URL for webhook triggers
  let webhookUrl: string | undefined;
  let webhookSecret: string | undefined;
  
  if (triggerType === "webhook") {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";
    webhookUrl = `${baseUrl}/api/v1/n8n/webhooks/${trigger.trigger_key}`;
    
    // SECURITY: Return secret on creation ONLY (shown once, then redacted)
    webhookSecret = trigger.config.webhookSecret as string;
  }

  // Prepare safe config for response (redact secret after first response)
  const safeConfig = { ...trigger.config };
  if (safeConfig.webhookSecret) {
    delete safeConfig.webhookSecret;
    safeConfig.hasWebhookSecret = true;
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
      webhookUrl,
      // SECURITY: Only shown on creation
      webhookSecret: webhookSecret ? {
        value: webhookSecret,
        warning: "Save this secret now - it will not be shown again. Use it to sign webhook requests.",
      } : undefined,
      createdAt: trigger.created_at,
    },
  });
}


/**
 * N8N Workflow Triggers API
 *
 * GET /api/v1/n8n/triggers?workflowId=xxx - List triggers for a workflow
 * POST /api/v1/n8n/triggers - Create a trigger
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import { logger } from "@/lib/utils/logger";
import { randomBytes } from "crypto";
import { z } from "zod";

const CreateTriggerSchema = z.object({
  workflowId: z.string().uuid(),
  triggerType: z.enum(["cron", "webhook", "a2a", "mcp"]),
  triggerKey: z.string().min(1).optional(), // Optional - will be auto-generated if not provided
  config: z.record(z.unknown()),
});

/**
 * GET /api/v1/n8n/triggers
 * Lists triggers for a workflow.
 */
export async function GET(request: NextRequest) {
  try {
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

    return NextResponse.json({
      success: true,
      triggers: triggers.map((t) => ({
        id: t.id,
        workflowId: t.workflow_id,
        triggerType: t.trigger_type,
        triggerKey: t.trigger_key,
        config: t.config,
        isActive: t.is_active,
        lastExecutedAt: t.last_executed_at,
        executionCount: t.execution_count,
        errorCount: t.error_count,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      })),
    });
  } catch (error) {
    logger.error("[N8N Triggers] Error listing triggers:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to list triggers",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/n8n/triggers
 * Creates a new trigger.
 */
export async function POST(request: NextRequest) {
  try {
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

    // For webhook triggers, generate webhook URL
    let webhookUrl: string | undefined;
    if (triggerType === "webhook") {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";
      const finalKey = triggerKey || randomBytes(32).toString("hex");
      webhookUrl = `${baseUrl}/api/v1/n8n/webhooks/${finalKey}`;
      // Store webhook URL in config
      config.webhookUrl = webhookUrl;
    }

    const trigger = await n8nWorkflowsService.createTrigger(
      workflowId,
      triggerType,
      triggerKey,
      config
    );

    logger.info(`[N8N Triggers] Created trigger: ${triggerType}:${triggerKey}`, {
      triggerId: trigger.id,
      workflowId,
    });

    return NextResponse.json({
      success: true,
      trigger: {
        id: trigger.id,
        workflowId: trigger.workflow_id,
        triggerType: trigger.trigger_type,
        triggerKey: trigger.trigger_key,
        config: trigger.config,
        isActive: trigger.is_active,
        webhookUrl: triggerType === "webhook" ? webhookUrl : undefined,
        createdAt: trigger.created_at,
      },
    });
  } catch (error) {
    logger.error("[N8N Triggers] Error creating trigger:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create trigger",
      },
      { status: 500 }
    );
  }
}


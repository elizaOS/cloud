/**
 * Workflow Triggers API
 *
 * GET /api/v1/workflows/[id]/triggers - List triggers for workflow
 * POST /api/v1/workflows/[id]/triggers - Create new trigger
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { logger } from "@/lib/utils/logger";
import { generatedWorkflowsRepository } from "@/db/repositories";
import { workflowTriggerService } from "@/lib/services/workflow-triggers";
import type { TriggerConfig, ResponseConfig } from "@/db/schemas/workflow-triggers";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id: workflowId } = await params;

  try {
    // Verify workflow exists and user has access
    const workflow = await generatedWorkflowsRepository.getById(workflowId);

    if (!workflow) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 },
      );
    }

    if (workflow.organization_id !== user.organization_id && !workflow.is_public) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 },
      );
    }

    // Get query params for filtering
    const url = new URL(request.url);
    const isActive = url.searchParams.get("isActive");

    const triggers = await workflowTriggerService.getWorkflowTriggers(
      workflowId,
      isActive !== null ? { isActive: isActive === "true" } : undefined,
    );

    return NextResponse.json({
      triggers: triggers.map((t) => ({
        id: t.id,
        workflowId: t.workflow_id,
        name: t.name,
        description: t.description,
        triggerType: t.trigger_type,
        triggerConfig: t.trigger_config,
        responseConfig: t.response_config,
        providerFilter: t.provider_filter,
        priority: t.priority,
        isActive: t.is_active,
        triggerCount: t.trigger_count,
        lastTriggeredAt: t.last_triggered_at,
        lastError: t.last_error,
        lastErrorAt: t.last_error_at,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      })),
    });
  } catch (error) {
    logger.error("[Triggers] Failed to list triggers", {
      error: error instanceof Error ? error.message : String(error),
      workflowId,
    });

    return NextResponse.json(
      { error: "Failed to list triggers" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id: workflowId } = await params;

  try {
    // Verify workflow exists and user owns it
    const workflow = await generatedWorkflowsRepository.getById(workflowId);

    if (!workflow) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 },
      );
    }

    if (workflow.organization_id !== user.organization_id) {
      return NextResponse.json(
        { error: "Not authorized to create triggers for this workflow" },
        { status: 403 },
      );
    }

    const body = await request.json();

    // Validate required fields
    if (!body.name || typeof body.name !== "string") {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 },
      );
    }

    if (!body.triggerType || typeof body.triggerType !== "string") {
      return NextResponse.json(
        { error: "triggerType is required" },
        { status: 400 },
      );
    }

    const validTriggerTypes = [
      "message_keyword",
      "message_contains",
      "message_from",
      "message_regex",
      "schedule",
      "webhook",
    ];

    if (!validTriggerTypes.includes(body.triggerType)) {
      return NextResponse.json(
        { error: `Invalid triggerType. Must be one of: ${validTriggerTypes.join(", ")}` },
        { status: 400 },
      );
    }

    const trigger = await workflowTriggerService.createTrigger({
      organizationId: user.organization_id,
      workflowId,
      userId: user.id,
      name: body.name,
      description: body.description,
      triggerType: body.triggerType,
      triggerConfig: (body.triggerConfig || {}) as TriggerConfig,
      responseConfig: (body.responseConfig || { sendResponse: true }) as ResponseConfig,
      providerFilter: body.providerFilter || "all",
      priority: body.priority ?? 0,
      isActive: body.isActive ?? true,
    });

    logger.info("[Triggers] Trigger created", {
      triggerId: trigger.id,
      workflowId,
      triggerType: trigger.trigger_type,
    });

    return NextResponse.json({
      success: true,
      trigger: {
        id: trigger.id,
        workflowId: trigger.workflow_id,
        name: trigger.name,
        description: trigger.description,
        triggerType: trigger.trigger_type,
        triggerConfig: trigger.trigger_config,
        responseConfig: trigger.response_config,
        providerFilter: trigger.provider_filter,
        priority: trigger.priority,
        isActive: trigger.is_active,
        triggerCount: trigger.trigger_count,
        createdAt: trigger.created_at,
      },
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    
    logger.error("[Triggers] Failed to create trigger", {
      error: message,
      workflowId,
    });

    // Return validation errors with 400
    if (message.includes("requires") || message.includes("Invalid") || message.includes("already exists")) {
      return NextResponse.json(
        { error: message },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Failed to create trigger" },
      { status: 500 },
    );
  }
}

/**
 * Single Trigger API
 *
 * GET /api/v1/workflows/[id]/triggers/[triggerId] - Get trigger details
 * PATCH /api/v1/workflows/[id]/triggers/[triggerId] - Update trigger
 * DELETE /api/v1/workflows/[id]/triggers/[triggerId] - Delete trigger
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
  params: Promise<{ id: string; triggerId: string }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id: workflowId, triggerId } = await params;

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

    const trigger = await workflowTriggerService.getTrigger(triggerId);

    if (!trigger || trigger.workflow_id !== workflowId) {
      return NextResponse.json(
        { error: "Trigger not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
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
        lastTriggeredAt: trigger.last_triggered_at,
        lastError: trigger.last_error,
        lastErrorAt: trigger.last_error_at,
        createdAt: trigger.created_at,
        updatedAt: trigger.updated_at,
      },
    });
  } catch (error) {
    logger.error("[Triggers] Failed to get trigger", {
      error: error instanceof Error ? error.message : String(error),
      workflowId,
      triggerId,
    });

    return NextResponse.json(
      { error: "Failed to get trigger" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id: workflowId, triggerId } = await params;

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
        { error: "Not authorized to update this trigger" },
        { status: 403 },
      );
    }

    const trigger = await workflowTriggerService.getTrigger(triggerId);

    if (!trigger || trigger.workflow_id !== workflowId) {
      return NextResponse.json(
        { error: "Trigger not found" },
        { status: 404 },
      );
    }

    const body = await request.json();

    // Build updates object
    const updates: {
      name?: string;
      description?: string;
      triggerConfig?: TriggerConfig;
      responseConfig?: ResponseConfig;
      providerFilter?: "all" | "twilio" | "blooio";
      priority?: number;
      isActive?: boolean;
    } = {};

    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.triggerConfig !== undefined) updates.triggerConfig = body.triggerConfig;
    if (body.responseConfig !== undefined) updates.responseConfig = body.responseConfig;
    if (body.providerFilter !== undefined) updates.providerFilter = body.providerFilter;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.isActive !== undefined) updates.isActive = body.isActive;

    const updated = await workflowTriggerService.updateTrigger(triggerId, updates);

    if (!updated) {
      return NextResponse.json(
        { error: "Failed to update trigger" },
        { status: 500 },
      );
    }

    logger.info("[Triggers] Trigger updated", {
      triggerId,
      workflowId,
      updates: Object.keys(updates),
    });

    return NextResponse.json({
      success: true,
      trigger: {
        id: updated.id,
        workflowId: updated.workflow_id,
        name: updated.name,
        description: updated.description,
        triggerType: updated.trigger_type,
        triggerConfig: updated.trigger_config,
        responseConfig: updated.response_config,
        providerFilter: updated.provider_filter,
        priority: updated.priority,
        isActive: updated.is_active,
        triggerCount: updated.trigger_count,
        lastTriggeredAt: updated.last_triggered_at,
        lastError: updated.last_error,
        lastErrorAt: updated.last_error_at,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    logger.error("[Triggers] Failed to update trigger", {
      error: message,
      workflowId,
      triggerId,
    });

    if (message.includes("requires") || message.includes("Invalid") || message.includes("already exists")) {
      return NextResponse.json(
        { error: message },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Failed to update trigger" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id: workflowId, triggerId } = await params;

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
        { error: "Not authorized to delete this trigger" },
        { status: 403 },
      );
    }

    const trigger = await workflowTriggerService.getTrigger(triggerId);

    if (!trigger || trigger.workflow_id !== workflowId) {
      return NextResponse.json(
        { error: "Trigger not found" },
        { status: 404 },
      );
    }

    await workflowTriggerService.deleteTrigger(triggerId);

    logger.info("[Triggers] Trigger deleted", {
      triggerId,
      workflowId,
    });

    return NextResponse.json({
      success: true,
      message: "Trigger deleted",
    });
  } catch (error) {
    logger.error("[Triggers] Failed to delete trigger", {
      error: error instanceof Error ? error.message : String(error),
      workflowId,
      triggerId,
    });

    return NextResponse.json(
      { error: "Failed to delete trigger" },
      { status: 500 },
    );
  }
}

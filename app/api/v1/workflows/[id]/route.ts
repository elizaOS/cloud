/**
 * Single Workflow API
 *
 * GET /api/v1/workflows/[id] - Get workflow details
 * PATCH /api/v1/workflows/[id] - Update workflow
 * DELETE /api/v1/workflows/[id] - Delete workflow
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { logger } from "@/lib/utils/logger";
import { generatedWorkflowsRepository, workflowExecutionsRepository } from "@/db/repositories";

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
  const { id } = await params;

  try {
    const workflow = await generatedWorkflowsRepository.getById(id);

    if (!workflow) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 },
      );
    }

    // Check ownership
    if (workflow.organization_id !== user.organization_id && !workflow.is_public) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 },
      );
    }

    // Fetch executions for this workflow
    const executions = await workflowExecutionsRepository.listByWorkflow(id, {
      limit: 20,
    });

    return NextResponse.json({
      workflow: {
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        userIntent: workflow.user_intent,
        code: workflow.generated_code,
        serviceDependencies: workflow.service_dependencies,
        executionPlan: workflow.execution_plan,
        testResults: workflow.test_results,
        generationMetadata: workflow.generation_metadata,
        status: workflow.status,
        usageCount: workflow.usage_count,
        successCount: workflow.success_count,
        failureCount: workflow.failure_count,
        successRate: workflow.success_rate,
        avgExecutionTimeMs: workflow.avg_execution_time_ms,
        isPublic: workflow.is_public,
        mcpId: workflow.mcp_id,
        sharedAt: workflow.shared_at,
        version: workflow.version,
        tags: workflow.tags,
        category: workflow.category,
        createdAt: workflow.created_at,
        updatedAt: workflow.updated_at,
        lastUsedAt: workflow.last_used_at,
      },
      executions: executions.map((e) => ({
        id: e.id,
        status: e.status,
        startedAt: e.started_at,
        completedAt: e.completed_at,
        executionTimeMs: e.execution_time_ms,
        inputParams: e.input_params,
        outputResult: e.output_result,
        errorMessage: e.error_message,
      })),
    });
  } catch (error) {
    logger.error("[Workflows] Failed to get workflow", {
      error: error instanceof Error ? error.message : String(error),
      workflowId: id,
    });

    return NextResponse.json(
      { error: "Failed to get workflow" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  try {
    const workflow = await generatedWorkflowsRepository.getById(id);

    if (!workflow) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 },
      );
    }

    // Check ownership
    if (workflow.organization_id !== user.organization_id) {
      return NextResponse.json(
        { error: "Not authorized to update this workflow" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const allowedUpdates = [
      "name",
      "description",
      "status",
      "tags",
      "category",
      "is_public",
    ];

    const updates: Record<string, unknown> = {};
    for (const key of allowedUpdates) {
      if (body[key] !== undefined) {
        updates[key] = body[key];
      }
    }

    const updated = await generatedWorkflowsRepository.update(id, updates);

    if (!updated) {
      return NextResponse.json(
        { error: "Failed to update workflow" },
        { status: 500 },
      );
    }

    logger.info("[Workflows] Workflow updated", {
      workflowId: id,
      updates: Object.keys(updates),
    });

    return NextResponse.json({
      success: true,
      workflow: {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        status: updated.status,
        tags: updated.tags,
        category: updated.category,
        isPublic: updated.is_public,
        updatedAt: updated.updated_at,
      },
    });
  } catch (error) {
    logger.error("[Workflows] Failed to update workflow", {
      error: error instanceof Error ? error.message : String(error),
      workflowId: id,
    });

    return NextResponse.json(
      { error: "Failed to update workflow" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  try {
    const workflow = await generatedWorkflowsRepository.getById(id);

    if (!workflow) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 },
      );
    }

    // Check ownership
    if (workflow.organization_id !== user.organization_id) {
      return NextResponse.json(
        { error: "Not authorized to delete this workflow" },
        { status: 403 },
      );
    }

    // Don't allow deleting shared workflows
    if (workflow.mcp_id) {
      return NextResponse.json(
        { error: "Cannot delete a shared workflow. Unshare it first." },
        { status: 400 },
      );
    }

    await generatedWorkflowsRepository.delete(id);

    logger.info("[Workflows] Workflow deleted", {
      workflowId: id,
      organizationId: user.organization_id,
    });

    return NextResponse.json({
      success: true,
      message: "Workflow deleted",
    });
  } catch (error) {
    logger.error("[Workflows] Failed to delete workflow", {
      error: error instanceof Error ? error.message : String(error),
      workflowId: id,
    });

    return NextResponse.json(
      { error: "Failed to delete workflow" },
      { status: 500 },
    );
  }
}

/**
 * N8N Workflow API - Individual Workflow
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import { UpdateWorkflowSchema } from "@/lib/schemas/n8n";

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await ctx.params;

  const workflow = await n8nWorkflowsService.getWorkflow(id);
  if (!workflow || workflow.organization_id !== user.organization_id) {
    return NextResponse.json({ success: false, error: "Workflow not found" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    workflow: {
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      workflowData: workflow.workflow_data,
      status: workflow.status,
      version: workflow.version,
      tags: workflow.tags,
      n8nWorkflowId: workflow.n8n_workflow_id,
      isActiveInN8n: workflow.is_active_in_n8n,
      createdAt: workflow.created_at,
      updatedAt: workflow.updated_at,
    },
  });
}

export async function PUT(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await ctx.params;

  // Verify ownership before allowing update
  const existingWorkflow = await n8nWorkflowsService.getWorkflow(id);
  if (!existingWorkflow || existingWorkflow.organization_id !== user.organization_id) {
    return NextResponse.json({ success: false, error: "Workflow not found" }, { status: 404 });
  }

  const body = await request.json();
  const validation = UpdateWorkflowSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      { success: false, error: "Invalid request", details: validation.error.format() },
      { status: 400 }
    );
  }

  if (validation.data.workflowData) {
    const validationResult = await n8nWorkflowsService.validateWorkflow(validation.data.workflowData);
    if (!validationResult.valid) {
      return NextResponse.json(
        { success: false, error: "Invalid workflow structure", errors: validationResult.errors },
        { status: 400 }
      );
    }
  }

  const workflow = await n8nWorkflowsService.updateWorkflow(id, validation.data);

  return NextResponse.json({
    success: true,
    workflow: {
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      status: workflow.status,
      version: workflow.version,
      tags: workflow.tags,
      updatedAt: workflow.updated_at,
    },
  });
}

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await ctx.params;

  const workflow = await n8nWorkflowsService.getWorkflow(id);
  if (!workflow || workflow.organization_id !== user.organization_id) {
    return NextResponse.json({ success: false, error: "Workflow not found" }, { status: 404 });
  }

  await n8nWorkflowsService.deleteWorkflow(id);
  return NextResponse.json({ success: true });
}


import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import { logger } from "@/lib/utils/logger";
import { CreateWorkflowSchema, ErrorResponses } from "@/lib/n8n/schemas";

export async function GET(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const status = request.nextUrl.searchParams.get("status") as "draft" | "active" | "archived" | null;
  const limit = Number.parseInt(request.nextUrl.searchParams.get("limit") || "100");
  const offset = Number.parseInt(request.nextUrl.searchParams.get("offset") || "0");

  const workflows = await n8nWorkflowsService.listWorkflows(user.organization_id, {
    status: status || undefined,
    limit,
    offset,
  });

  return NextResponse.json({
    success: true,
    workflows: workflows.map((w) => ({
      id: w.id,
      name: w.name,
      description: w.description,
      status: w.status,
      version: w.version,
      tags: w.tags,
      n8nWorkflowId: w.n8n_workflow_id,
      isActiveInN8n: w.is_active_in_n8n,
      createdAt: w.created_at,
      updatedAt: w.updated_at,
    })),
  });
}

export async function POST(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const body = await request.json();
  const validation = CreateWorkflowSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(ErrorResponses.invalidRequest(validation.error.format()), { status: 400 });
  }

  const { name, description, workflowData, tags } = validation.data;
  const validationResult = await n8nWorkflowsService.validateWorkflow(workflowData);
  
  if (!validationResult.valid) {
    return NextResponse.json(
      { success: false, error: "Invalid workflow structure", errors: validationResult.errors },
      { status: 400 }
    );
  }

  const workflow = await n8nWorkflowsService.createWorkflow({
    organizationId: user.organization_id,
    userId: user.id,
    name,
    description,
    workflowData,
    tags,
  });

  logger.info(`[N8N] Created workflow: ${name}`, { userId: user.id, workflowId: workflow.id });

  return NextResponse.json({
    success: true,
    workflow: {
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      status: workflow.status,
      version: workflow.version,
      tags: workflow.tags,
      createdAt: workflow.created_at,
      updatedAt: workflow.updated_at,
    },
  });
}


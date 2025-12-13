import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import { logger } from "@/lib/utils/logger";
import { ExecuteWorkflowSchema, ErrorResponses } from "@/lib/n8n/schemas";

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await ctx.params;

  const workflow = await n8nWorkflowsService.getWorkflow(id);
  if (!workflow || workflow.organization_id !== user.organization_id) {
    return NextResponse.json(ErrorResponses.workflowNotFound, { status: 404 });
  }

  const contentLength = request.headers.get("content-length");
  const body = contentLength === "0" || !contentLength ? {} : await request.json();
  const validation = ExecuteWorkflowSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(ErrorResponses.invalidRequest(validation.error.format()), { status: 400 });
  }

  const { inputData, triggerType } = validation.data;

  const execution = await n8nWorkflowsService.testWorkflow({
    workflowId: id,
    inputData,
    userId: user.id,
  });

  logger.info(`[N8N Workflows] Executed workflow ${id} via REST API`, {
    workflowId: id,
    executionId: execution.id,
    triggerType,
    organizationId: user.organization_id,
  });

  return NextResponse.json({
    success: true,
    execution: {
      id: execution.id,
      status: execution.status,
      outputData: execution.output_data,
      errorMessage: execution.error_message,
      durationMs: execution.duration_ms,
      startedAt: execution.started_at,
      finishedAt: execution.finished_at,
    },
  });
}



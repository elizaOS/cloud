import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import { TestWorkflowSchema, ErrorResponses } from "@/lib/n8n/schemas";

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
  const validation = TestWorkflowSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(ErrorResponses.invalidRequest(validation.error.format()), { status: 400 });
  }

  const { inputData } = validation.data;

  const execution = await n8nWorkflowsService.testWorkflow({
    workflowId: id,
    inputData,
    userId: user.id,
  });

  const isRealExecution = execution.n8n_execution_id !== null;

  return NextResponse.json({
    success: execution.status === "success",
    executionId: execution.id,
    status: execution.status === "success" ? "completed" : execution.status === "error" ? "failed" : execution.status,
    startTime: execution.started_at,
    endTime: execution.finished_at,
    duration: execution.duration_ms,
    output: execution.output_data,
    error: execution.error_message,
    executionMode: isRealExecution ? "real" : "simulated",
    n8nExecutionId: execution.n8n_execution_id,
  });
}



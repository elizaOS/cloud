import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import { ErrorResponses } from "@/lib/n8n/schemas";

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await ctx.params;

  const workflow = await n8nWorkflowsService.getWorkflow(id);
  if (!workflow || workflow.organization_id !== user.organization_id) {
    return NextResponse.json(ErrorResponses.workflowNotFound, { status: 404 });
  }

  const limit = Number.parseInt(
    request.nextUrl.searchParams.get("limit") || "50",
  );

  const executions = await n8nWorkflowsService.getWorkflowExecutions(id, limit);

  return NextResponse.json({
    success: true,
    executions: executions.map((e) => ({
      id: e.id,
      executionType: e.execution_type,
      status: e.status,
      inputData: e.input_data,
      outputData: e.output_data,
      errorMessage: e.error_message,
      durationMs: e.duration_ms,
      n8nExecutionId: e.n8n_execution_id,
      startedAt: e.started_at.toISOString(),
      finishedAt: e.finished_at?.toISOString(),
      createdAt: e.created_at.toISOString(),
    })),
    count: executions.length,
  });
}

/**
 * App N8N Workflow Executions API
 *
 * GET /api/v1/app/n8n/workflows/:id/executions - List execution history
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAppAuth } from "@/lib/middleware/app-auth";
import { appsService } from "@/lib/services/apps";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import { logger } from "@/lib/utils/logger";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-App-Token, X-Api-Key",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * GET /api/v1/app/n8n/workflows/:id/executions
 * Lists execution history for a workflow.
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAppAuth(request);
    const { id } = await ctx.params;

    const apps = await appsService.listByOrganization(user.organization_id);
    if (apps.length === 0) {
      return NextResponse.json(
        { success: false, error: "No app found" },
        { status: 404, headers: corsHeaders },
      );
    }

    const workflow = await n8nWorkflowsService.getWorkflow(id);
    if (!workflow || workflow.organization_id !== user.organization_id) {
      return NextResponse.json(
        { success: false, error: "Workflow not found" },
        { status: 404, headers: corsHeaders },
      );
    }

    const limit = Number.parseInt(
      request.nextUrl.searchParams.get("limit") || "50",
    );

    const executions = await n8nWorkflowsService.getWorkflowExecutions(
      id,
      limit,
    );

    return NextResponse.json(
      {
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
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    logger.error("[App N8N Executions] Error listing executions:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to list executions",
      },
      { status: 500, headers: corsHeaders },
    );
  }
}

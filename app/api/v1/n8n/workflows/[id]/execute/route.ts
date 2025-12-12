/**
 * N8N Workflow Execute API
 *
 * POST /api/v1/n8n/workflows/:id/execute - Execute workflow (REST endpoint for apps)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

const ExecuteWorkflowSchema = z.object({
  inputData: z.record(z.unknown()).optional(),
  triggerType: z.enum(["manual", "api", "app"]).optional().default("api"),
});

/**
 * POST /api/v1/n8n/workflows/:id/execute
 * Executes a workflow via REST API (for app usage).
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await ctx.params;

  const workflow = await n8nWorkflowsService.getWorkflow(id);
  if (!workflow || workflow.organization_id !== user.organization_id) {
    return NextResponse.json(
      { success: false, error: "Workflow not found" },
      { status: 404 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const validation = ExecuteWorkflowSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      { success: false, error: "Invalid request", details: validation.error.format() },
      { status: 400 }
    );
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



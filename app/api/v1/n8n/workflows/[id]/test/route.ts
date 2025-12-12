/**
 * N8N Workflow Test API
 *
 * POST /api/v1/n8n/workflows/:id/test - Test workflow execution
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

const TestWorkflowSchema = z.object({
  inputData: z.record(z.unknown()).optional(),
});

/**
 * POST /api/v1/n8n/workflows/:id/test
 * Tests a workflow execution.
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
  const validation = TestWorkflowSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      { success: false, error: "Invalid request", details: validation.error.format() },
      { status: 400 }
    );
  }

  const { inputData } = validation.data;

  const execution = await n8nWorkflowsService.testWorkflow({
    workflowId: id,
    inputData,
    userId: user.id,
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



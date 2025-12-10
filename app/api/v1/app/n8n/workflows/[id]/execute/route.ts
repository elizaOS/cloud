/**
 * App N8N Workflow Execute API
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAppAuth } from "@/lib/middleware/app-auth";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import { logger } from "@/lib/utils/logger";
import { APP_CORS_HEADERS, corsOptions, withCors } from "@/lib/utils/cors";
import { ExecuteWorkflowSchema } from "@/lib/schemas/n8n";

export const OPTIONS = corsOptions;

export function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  return withCors(async () => {
    const user = await requireAppAuth(request);
    const { id } = await ctx.params;

    const workflow = await n8nWorkflowsService.getWorkflow(id);
    if (!workflow || workflow.organization_id !== user.organization_id) {
      return NextResponse.json(
        { success: false, error: "Workflow not found" },
        { status: 404, headers: APP_CORS_HEADERS }
      );
    }

    const body = await request.json().catch(() => ({}));
    const validation = ExecuteWorkflowSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request", details: validation.error.format() },
        { status: 400, headers: APP_CORS_HEADERS }
      );
    }

    const execution = await n8nWorkflowsService.testWorkflow({
      workflowId: id,
      inputData: validation.data.inputData,
      userId: user.id,
    });

    logger.info(`[App N8N] Executed workflow ${id}`, { executionId: execution.id });

    return NextResponse.json(
      {
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
      },
      { headers: APP_CORS_HEADERS }
    );
  });
}


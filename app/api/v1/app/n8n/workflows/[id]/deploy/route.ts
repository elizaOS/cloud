/**
 * App N8N Workflow Deploy API
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAppAuth } from "@/lib/middleware/app-auth";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import { logger } from "@/lib/utils/logger";
import { APP_CORS_HEADERS, corsOptions, withCors } from "@/lib/utils/cors";
import { DeployWorkflowSchema } from "@/lib/n8n/schemas";

export const OPTIONS = corsOptions;

export function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  return withCors(async () => {
    const user = await requireAppAuth(request);
    const { id } = await ctx.params;

    const workflow = await n8nWorkflowsService.getWorkflow(id);
    if (!workflow || workflow.organization_id !== user.organization_id) {
      return NextResponse.json(
        { success: false, error: "Workflow not found" },
        { status: 404, headers: APP_CORS_HEADERS },
      );
    }

    const body = await request.json();
    const validation = DeployWorkflowSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request",
          details: validation.error.format(),
        },
        { status: 400, headers: APP_CORS_HEADERS },
      );
    }

    const result = await n8nWorkflowsService.deployWorkflowToN8n(
      id,
      validation.data.instanceId,
    );
    logger.info(`[App N8N] Deployed workflow ${id}`, {
      n8nWorkflowId: result.n8nWorkflowId,
    });

    return NextResponse.json(
      { success: true, n8nWorkflowId: result.n8nWorkflowId },
      { headers: APP_CORS_HEADERS },
    );
  });
}

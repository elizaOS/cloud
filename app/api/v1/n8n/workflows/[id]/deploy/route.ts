/**
 * N8N Workflow Deploy API
 *
 * POST /api/v1/n8n/workflows/:id/deploy - Deploy workflow to n8n instance
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

const DeployWorkflowSchema = z.object({
  instanceId: z.string().uuid(),
});

/**
 * POST /api/v1/n8n/workflows/:id/deploy
 * Deploys a workflow to an n8n instance.
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { id } = await ctx.params;

    if (!user.organization_id) {
      return NextResponse.json(
        { success: false, error: "User has no organization" },
        { status: 400 }
      );
    }

    const workflow = await n8nWorkflowsService.getWorkflow(id);
    if (!workflow || workflow.organization_id !== user.organization_id) {
      return NextResponse.json(
        { success: false, error: "Workflow not found" },
        { status: 404 }
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
        { status: 400 }
      );
    }

    const { instanceId } = validation.data;

    const result = await n8nWorkflowsService.deployWorkflowToN8n(id, instanceId);

    logger.info(`[N8N Workflows] Deployed workflow ${id} to n8n`, {
      workflowId: id,
      instanceId,
      n8nWorkflowId: result.n8nWorkflowId,
    });

    return NextResponse.json({
      success: true,
      n8nWorkflowId: result.n8nWorkflowId,
    });
  } catch (error) {
    logger.error("[N8N Workflows] Error deploying workflow:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to deploy workflow",
      },
      { status: 500 }
    );
  }
}



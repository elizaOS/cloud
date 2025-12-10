/**
 * App N8N Workflow Revert API
 *
 * POST /api/v1/app/n8n/workflows/:id/revert - Revert workflow to a version
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAppAuth } from "@/lib/middleware/app-auth";
import { appsService } from "@/lib/services/apps";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-App-Token, X-Api-Key",
};

const RevertWorkflowSchema = z.object({
  version: z.number().int().positive(),
});

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * POST /api/v1/app/n8n/workflows/:id/revert
 * Reverts a workflow to a specific version.
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAppAuth(request);
    const { id } = await ctx.params;

    const apps = await appsService.listByOrganization(user.organization_id);
    if (apps.length === 0) {
      return NextResponse.json(
        { success: false, error: "No app found" },
        { status: 404, headers: corsHeaders }
      );
    }

    const body = await request.json();
    const validation = RevertWorkflowSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request",
          details: validation.error.format(),
        },
        { status: 400, headers: corsHeaders }
      );
    }

    const { version } = validation.data;

    const workflow = await n8nWorkflowsService.revertWorkflowToVersion(
      id,
      version,
      user.id
    );

    return NextResponse.json(
      {
        success: true,
        workflow: {
          id: workflow.id,
          version: workflow.version,
          updatedAt: workflow.updated_at,
        },
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    logger.error("[App N8N Workflows] Error reverting workflow:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to revert workflow",
      },
      { status: 500, headers: corsHeaders }
    );
  }
}



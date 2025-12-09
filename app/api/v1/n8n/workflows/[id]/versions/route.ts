/**
 * N8N Workflow Versions API
 *
 * GET /api/v1/n8n/workflows/:id/versions - List versions
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import { logger } from "@/lib/utils/logger";

/**
 * GET /api/v1/n8n/workflows/:id/versions
 * Lists version history for a workflow.
 */
export async function GET(
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

    const limit = Number.parseInt(
      request.nextUrl.searchParams.get("limit") || "50"
    );

    const versions = await n8nWorkflowsService.getWorkflowVersions(id, limit);

    return NextResponse.json({
      success: true,
      versions: versions.map((v) => ({
        id: v.id,
        version: v.version,
        changeDescription: v.change_description,
        createdAt: v.created_at,
        createdBy: v.created_by,
      })),
    });
  } catch (error) {
    logger.error("[N8N Workflows] Error listing versions:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to list versions",
      },
      { status: 500 }
    );
  }
}



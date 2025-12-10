/**
 * App N8N Workflow Versions API
 *
 * GET /api/v1/app/n8n/workflows/:id/versions - List versions
 * POST /api/v1/app/n8n/workflows/:id/versions/:version/revert - Revert to version
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAppAuth } from "@/lib/middleware/app-auth";
import { appsService } from "@/lib/services/apps";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import { logger } from "@/lib/utils/logger";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-App-Token, X-Api-Key",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * GET /api/v1/app/n8n/workflows/:id/versions
 * Lists version history for a workflow.
 */
export async function GET(
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

    const limit = Number.parseInt(
      request.nextUrl.searchParams.get("limit") || "50"
    );

    const versions = await n8nWorkflowsService.getWorkflowVersions(id, limit);

    return NextResponse.json(
      {
        success: true,
        versions: versions.map((v) => ({
          id: v.id,
          version: v.version,
          changeDescription: v.change_description,
          createdAt: v.created_at,
          createdBy: v.created_by,
        })),
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    logger.error("[App N8N Workflows] Error listing versions:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to list versions",
      },
      { status: 500, headers: corsHeaders }
    );
  }
}



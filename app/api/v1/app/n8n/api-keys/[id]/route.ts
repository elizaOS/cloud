/**
 * App N8N API Key API - Individual Key
 *
 * DELETE /api/v1/app/n8n/api-keys/:id - Delete API key
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAppAuth } from "@/lib/middleware/app-auth";
import { appsService } from "@/lib/services/apps";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import { logger } from "@/lib/utils/logger";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-App-Token, X-Api-Key",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * DELETE /api/v1/app/n8n/api-keys/:id
 * Deletes an API key.
 */
export async function DELETE(
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

    await n8nWorkflowsService.deleteApiKey(id);

    logger.info(`[App N8N API Keys] Deleted API key: ${id}`);

    return NextResponse.json(
      { success: true },
      { headers: corsHeaders }
    );
  } catch (error) {
    logger.error("[App N8N API Keys] Error deleting API key:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete API key",
      },
      { status: 500, headers: corsHeaders }
    );
  }
}



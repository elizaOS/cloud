/**
 * N8N API Key API - Individual API Key
 *
 * DELETE /api/v1/n8n/api-keys/:id - Delete API key
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { n8nWorkflowApiKeysRepository } from "@/db/repositories/n8n-workflows";
import { logger } from "@/lib/utils/logger";

/**
 * DELETE /api/v1/n8n/api-keys/:id
 * Deletes an API key.
 */
export async function DELETE(
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

    const apiKey = await n8nWorkflowApiKeysRepository.findById(id);
    if (!apiKey || apiKey.organization_id !== user.organization_id) {
      return NextResponse.json(
        { success: false, error: "API key not found" },
        { status: 404 }
      );
    }

    await n8nWorkflowApiKeysRepository.delete(id);

    logger.info(`[N8N API Keys] Deleted API key: ${id}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[N8N API Keys] Error deleting API key:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete API key",
      },
      { status: 500 }
    );
  }
}



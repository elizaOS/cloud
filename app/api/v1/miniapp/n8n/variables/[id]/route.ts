/**
 * Miniapp N8N Variable API - Individual Variable
 *
 * PUT /api/v1/miniapp/n8n/variables/:id - Update variable
 * DELETE /api/v1/miniapp/n8n/variables/:id - Delete variable
 */

import { NextRequest, NextResponse } from "next/server";
import { requireMiniappAuth } from "@/lib/middleware/miniapp-auth";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Miniapp-Token, X-Api-Key",
};

const UpdateVariableSchema = z.object({
  value: z.string().optional(),
  type: z.enum(["string", "number", "boolean", "json"]).optional(),
  description: z.string().optional(),
  isSecret: z.boolean().optional(),
});

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * PUT /api/v1/miniapp/n8n/variables/:id
 * Updates a variable.
 */
export async function PUT(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await requireMiniappAuth(request);
    const { id } = await ctx.params;

    const body = await request.json();
    const validation = UpdateVariableSchema.safeParse(body);

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

    const variable = await n8nWorkflowsService.updateVariable(id, validation.data);

    return NextResponse.json(
      {
        success: true,
        variable: {
          id: variable.id,
          name: variable.name,
          value: variable.is_secret ? "***" : variable.value,
          type: variable.type,
          isSecret: variable.is_secret,
          description: variable.description,
          updatedAt: variable.updated_at,
        },
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    logger.error("[Miniapp N8N Variables] Error updating variable:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update variable",
      },
      { status: 500, headers: corsHeaders }
    );
  }
}

/**
 * DELETE /api/v1/miniapp/n8n/variables/:id
 * Deletes a variable.
 */
export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await requireMiniappAuth(request);
    const { id } = await ctx.params;

    await n8nWorkflowsService.deleteVariable(id);

    logger.info(`[Miniapp N8N Variables] Deleted variable: ${id}`);

    return NextResponse.json(
      { success: true },
      { headers: corsHeaders }
    );
  } catch (error) {
    logger.error("[Miniapp N8N Variables] Error deleting variable:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete variable",
      },
      { status: 500, headers: corsHeaders }
    );
  }
}



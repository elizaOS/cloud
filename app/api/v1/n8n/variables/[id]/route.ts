/**
 * N8N Variable API - Individual Variable
 *
 * PUT /api/v1/n8n/variables/:id - Update variable
 * DELETE /api/v1/n8n/variables/:id - Delete variable
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

const UpdateVariableSchema = z.object({
  value: z.string().optional(),
  type: z.enum(["string", "number", "boolean", "json"]).optional(),
  description: z.string().optional(),
  isSecret: z.boolean().optional(),
});

/**
 * PUT /api/v1/n8n/variables/:id
 * Updates a variable.
 */
export async function PUT(
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

    const body = await request.json();
    const validation = UpdateVariableSchema.safeParse(body);

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

    const variable = await n8nWorkflowsService.updateVariable(id, validation.data);

    return NextResponse.json({
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
    });
  } catch (error) {
    logger.error("[N8N Variables] Error updating variable:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update variable",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/n8n/variables/:id
 * Deletes a variable.
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

    await n8nWorkflowsService.deleteVariable(id);

    logger.info(`[N8N Variables] Deleted variable: ${id}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[N8N Variables] Error deleting variable:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete variable",
      },
      { status: 500 }
    );
  }
}



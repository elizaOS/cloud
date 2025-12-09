/**
 * N8N Workflow Variables API
 *
 * GET /api/v1/n8n/workflows/:id/variables - List workflow variables
 * POST /api/v1/n8n/workflows/:id/variables - Create workflow variable
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

const CreateVariableSchema = z.object({
  name: z.string().min(1),
  value: z.string(),
  type: z.enum(["string", "number", "boolean", "json"]).optional(),
  isSecret: z.boolean().optional(),
  description: z.string().optional(),
});

/**
 * GET /api/v1/n8n/workflows/:id/variables
 * Lists variables for a workflow.
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

    const variables = await n8nWorkflowsService.getWorkflowVariables(id);

    return NextResponse.json({
      success: true,
      variables: variables.map((v) => ({
        id: v.id,
        name: v.name,
        value: v.is_secret ? "***" : v.value,
        type: v.type,
        isSecret: v.is_secret,
        description: v.description,
        createdAt: v.created_at,
        updatedAt: v.updated_at,
      })),
    });
  } catch (error) {
    logger.error("[N8N Workflow Variables] Error listing variables:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to list variables",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/n8n/workflows/:id/variables
 * Creates a workflow variable.
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
    const validation = CreateVariableSchema.safeParse(body);

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

    const { name, value, type, isSecret, description } = validation.data;

    const variable = await n8nWorkflowsService.createVariable({
      organizationId: user.organization_id,
      workflowId: id,
      name,
      value,
      type,
      isSecret,
      description,
    });

    return NextResponse.json({
      success: true,
      variable: {
        id: variable.id,
        name: variable.name,
        value: variable.is_secret ? "***" : variable.value,
        type: variable.type,
        isSecret: variable.is_secret,
        description: variable.description,
        createdAt: variable.created_at,
        updatedAt: variable.updated_at,
      },
    });
  } catch (error) {
    logger.error("[N8N Workflow Variables] Error creating variable:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create variable",
      },
      { status: 500 }
    );
  }
}



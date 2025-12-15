/**
 * App N8N Workflow Variables API
 *
 * GET /api/v1/app/n8n/workflows/:id/variables - List workflow variables
 * POST /api/v1/app/n8n/workflows/:id/variables - Create workflow variable
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAppAuth } from "@/lib/middleware/app-auth";
import { appsService } from "@/lib/services/apps";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-App-Token, X-Api-Key",
};

const CreateVariableSchema = z.object({
  name: z.string().min(1),
  value: z.string(),
  type: z.enum(["string", "number", "boolean", "json"]).optional(),
  isSecret: z.boolean().optional(),
  description: z.string().optional(),
});

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * GET /api/v1/app/n8n/workflows/:id/variables
 * Lists variables for a specific workflow.
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAppAuth(request);
    const { id } = await ctx.params;

    const apps = await appsService.listByOrganization(user.organization_id);
    if (apps.length === 0) {
      return NextResponse.json(
        { success: false, error: "No app found" },
        { status: 404, headers: corsHeaders },
      );
    }

    const workflow = await n8nWorkflowsService.getWorkflow(id);
    if (!workflow || workflow.organization_id !== user.organization_id) {
      return NextResponse.json(
        { success: false, error: "Workflow not found" },
        { status: 404, headers: corsHeaders },
      );
    }

    const variables = await n8nWorkflowsService.getWorkflowVariables(id);

    return NextResponse.json(
      {
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
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    logger.error(
      "[App N8N Variables] Error listing workflow variables:",
      error,
    );
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to list variables",
      },
      { status: 500, headers: corsHeaders },
    );
  }
}

/**
 * POST /api/v1/app/n8n/workflows/:id/variables
 * Creates a new workflow variable.
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAppAuth(request);
    const { id } = await ctx.params;

    const apps = await appsService.listByOrganization(user.organization_id);
    if (apps.length === 0) {
      return NextResponse.json(
        { success: false, error: "No app found" },
        { status: 404, headers: corsHeaders },
      );
    }

    const workflow = await n8nWorkflowsService.getWorkflow(id);
    if (!workflow || workflow.organization_id !== user.organization_id) {
      return NextResponse.json(
        { success: false, error: "Workflow not found" },
        { status: 404, headers: corsHeaders },
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
        { status: 400, headers: corsHeaders },
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
          createdAt: variable.created_at,
          updatedAt: variable.updated_at,
        },
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    logger.error(
      "[App N8N Variables] Error creating workflow variable:",
      error,
    );
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to create variable",
      },
      { status: 500, headers: corsHeaders },
    );
  }
}

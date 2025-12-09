/**
 * N8N Variables API
 *
 * GET /api/v1/n8n/variables - List variables (global)
 * POST /api/v1/n8n/variables - Create variable
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
 * GET /api/v1/n8n/variables
 * Lists global variables for the authenticated organization.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);

    if (!user.organization_id) {
      return NextResponse.json(
        { success: false, error: "User has no organization" },
        { status: 400 }
      );
    }

    const variables = await n8nWorkflowsService.getGlobalVariables(user.organization_id);

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
    logger.error("[N8N Variables] Error listing variables:", error);
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
 * POST /api/v1/n8n/variables
 * Creates a new global variable.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);

    if (!user.organization_id) {
      return NextResponse.json(
        { success: false, error: "User has no organization" },
        { status: 400 }
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
      name,
      value,
      type,
      isSecret,
      description,
    });

    logger.info(`[N8N Variables] Created variable: ${name}`, {
      organizationId: user.organization_id,
      variableId: variable.id,
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
    logger.error("[N8N Variables] Error creating variable:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create variable",
      },
      { status: 500 }
    );
  }
}



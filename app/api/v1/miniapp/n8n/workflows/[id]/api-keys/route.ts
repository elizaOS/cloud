/**
 * Miniapp N8N Workflow API Keys API
 *
 * GET /api/v1/miniapp/n8n/workflows/:id/api-keys - List workflow API keys
 * POST /api/v1/miniapp/n8n/workflows/:id/api-keys - Create workflow API key
 */

import { NextRequest, NextResponse } from "next/server";
import { requireMiniappAuth } from "@/lib/middleware/miniapp-auth";
import { appsService } from "@/lib/services/apps";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Miniapp-Token, X-Api-Key",
};

const CreateApiKeySchema = z.object({
  name: z.string().min(1),
  scopes: z.array(z.string()).optional(),
  expiresAt: z.string().datetime().optional(),
});

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * GET /api/v1/miniapp/n8n/workflows/:id/api-keys
 * Lists API keys for a specific workflow.
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireMiniappAuth(request);
    const { id } = await ctx.params;

    const apps = await appsService.listByOrganization(user.organization_id);
    if (apps.length === 0) {
      return NextResponse.json(
        { success: false, error: "No app found" },
        { status: 404, headers: corsHeaders }
      );
    }

    const workflow = await n8nWorkflowsService.getWorkflow(id);
    if (!workflow || workflow.organization_id !== user.organization_id) {
      return NextResponse.json(
        { success: false, error: "Workflow not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    const apiKeys = await n8nWorkflowsService.listApiKeys(user.organization_id, id);

    return NextResponse.json(
      {
        success: true,
        apiKeys: apiKeys.map((k) => ({
          id: k.id,
          name: k.name,
          keyPrefix: k.key_prefix,
          scopes: k.scopes,
          isActive: k.is_active,
          expiresAt: k.expires_at,
          lastUsedAt: k.last_used_at,
          createdAt: k.created_at,
        })),
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    logger.error("[Miniapp N8N API Keys] Error listing workflow API keys:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to list API keys",
      },
      { status: 500, headers: corsHeaders }
    );
  }
}

/**
 * POST /api/v1/miniapp/n8n/workflows/:id/api-keys
 * Creates a new workflow API key.
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireMiniappAuth(request);
    const { id } = await ctx.params;

    const apps = await appsService.listByOrganization(user.organization_id);
    if (apps.length === 0) {
      return NextResponse.json(
        { success: false, error: "No app found" },
        { status: 404, headers: corsHeaders }
      );
    }

    const workflow = await n8nWorkflowsService.getWorkflow(id);
    if (!workflow || workflow.organization_id !== user.organization_id) {
      return NextResponse.json(
        { success: false, error: "Workflow not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    const body = await request.json();
    const validation = CreateApiKeySchema.safeParse(body);

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

    const { name, scopes, expiresAt } = validation.data;

    const result = await n8nWorkflowsService.createApiKey({
      organizationId: user.organization_id,
      workflowId: id,
      name,
      scopes,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });

    return NextResponse.json(
      {
        success: true,
        apiKey: {
          id: result.apiKey.id,
          name: result.apiKey.name,
          keyPrefix: result.apiKey.key_prefix,
          plaintextKey: result.plaintextKey, // Only returned on creation
          scopes: result.apiKey.scopes,
          expiresAt: result.apiKey.expires_at,
          createdAt: result.apiKey.created_at,
        },
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    logger.error("[Miniapp N8N API Keys] Error creating workflow API key:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create API key",
      },
      { status: 500, headers: corsHeaders }
    );
  }
}


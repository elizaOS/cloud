/**
 * N8N Workflow API Keys API
 *
 * GET /api/v1/n8n/workflows/:id/api-keys - List workflow API keys
 * POST /api/v1/n8n/workflows/:id/api-keys - Create workflow API key
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

const CreateApiKeySchema = z.object({
  name: z.string().min(1),
  scopes: z.array(z.string()).optional(),
  expiresAt: z.string().datetime().optional(),
});

/**
 * GET /api/v1/n8n/workflows/:id/api-keys
 * Lists API keys for a specific workflow.
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

    const apiKeys = await n8nWorkflowsService.listApiKeys(user.organization_id, id);

    return NextResponse.json({
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
    });
  } catch (error) {
    logger.error("[N8N Workflow API Keys] Error listing API keys:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to list API keys",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/n8n/workflows/:id/api-keys
 * Creates a new workflow API key.
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
    const validation = CreateApiKeySchema.safeParse(body);

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

    const { name, scopes, expiresAt } = validation.data;

    const result = await n8nWorkflowsService.createApiKey({
      organizationId: user.organization_id,
      workflowId: id,
      name,
      scopes,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });

    return NextResponse.json({
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
    });
  } catch (error) {
    logger.error("[N8N Workflow API Keys] Error creating API key:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create API key",
      },
      { status: 500 }
    );
  }
}



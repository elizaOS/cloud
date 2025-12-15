/**
 * App N8N API Keys API
 *
 * GET /api/v1/app/n8n/api-keys - List API keys (global)
 * POST /api/v1/app/n8n/api-keys - Create API key
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAppAuth } from "@/lib/middleware/app-auth";
import { appsService } from "@/lib/services/apps";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-App-Token, X-Api-Key",
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
 * GET /api/v1/app/n8n/api-keys
 * Lists global API keys for the authenticated app.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAppAuth(request);

    const apps = await appsService.listByOrganization(user.organization_id);
    if (apps.length === 0) {
      return NextResponse.json(
        { success: false, error: "No app found for this organization" },
        { status: 404, headers: corsHeaders },
      );
    }

    const apiKeys = await n8nWorkflowsService.listApiKeys(user.organization_id);

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
      { headers: corsHeaders },
    );
  } catch (error) {
    logger.error("[App N8N API Keys] Error listing API keys:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to list API keys",
      },
      { status: 500, headers: corsHeaders },
    );
  }
}

/**
 * POST /api/v1/app/n8n/api-keys
 * Creates a new global API key.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAppAuth(request);

    const apps = await appsService.listByOrganization(user.organization_id);
    if (apps.length === 0) {
      return NextResponse.json(
        { success: false, error: "No app found for this organization" },
        { status: 404, headers: corsHeaders },
      );
    }

    const app = apps[0];

    const body = await request.json();
    const validation = CreateApiKeySchema.safeParse(body);

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

    const { name, scopes, expiresAt } = validation.data;

    const result = await n8nWorkflowsService.createApiKey({
      organizationId: user.organization_id,
      name,
      scopes,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });

    logger.info(`[App N8N API Keys] Created API key: ${name}`, {
      appId: app.id,
      apiKeyId: result.apiKey.id,
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
      { headers: corsHeaders },
    );
  } catch (error) {
    logger.error("[App N8N API Keys] Error creating API key:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to create API key",
      },
      { status: 500, headers: corsHeaders },
    );
  }
}

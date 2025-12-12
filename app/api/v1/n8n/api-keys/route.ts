/**
 * N8N API Keys API
 *
 * GET /api/v1/n8n/api-keys - List API keys (global)
 * POST /api/v1/n8n/api-keys - Create API key
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
 * GET /api/v1/n8n/api-keys
 * Lists global API keys for the authenticated organization.
 */
export async function GET(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const apiKeys = await n8nWorkflowsService.listApiKeys(user.organization_id);

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
}

/**
 * POST /api/v1/n8n/api-keys
 * Creates a new global API key.
 */
export async function POST(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const body = await request.json();
  const validation = CreateApiKeySchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      { success: false, error: "Invalid request", details: validation.error.format() },
      { status: 400 }
    );
  }

  const { name, scopes, expiresAt } = validation.data;

  const result = await n8nWorkflowsService.createApiKey({
    organizationId: user.organization_id,
    name,
    scopes,
    expiresAt: expiresAt ? new Date(expiresAt) : undefined,
  });

  logger.info(`[N8N API Keys] Created API key: ${name}`, {
    organizationId: user.organization_id,
    apiKeyId: result.apiKey.id,
  });

  return NextResponse.json({
    success: true,
    apiKey: {
      id: result.apiKey.id,
      name: result.apiKey.name,
      keyPrefix: result.apiKey.key_prefix,
      plaintextKey: result.plaintextKey,
      scopes: result.apiKey.scopes,
      expiresAt: result.apiKey.expires_at,
      createdAt: result.apiKey.created_at,
    },
  });
}



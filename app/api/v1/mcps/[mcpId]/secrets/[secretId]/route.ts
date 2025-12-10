/**
 * Individual MCP Secret API
 *
 * GET /api/v1/mcps/[mcpId]/secrets/[secretId] - Get secret value
 * PATCH /api/v1/mcps/[mcpId]/secrets/[secretId] - Update secret
 * DELETE /api/v1/mcps/[mcpId]/secrets/[secretId] - Delete secret
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { secretsService, type AuditContext } from "@/lib/services/secrets";
import { secretsRepository } from "@/db/repositories/secrets";
import { userMcpsService } from "@/lib/services/user-mcps";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const updateSecretSchema = z.object({
  value: z.string().min(1).max(65536).optional(),
  description: z.string().max(1024).optional(),
});

function buildAuditContext(
  request: NextRequest,
  authResult: Awaited<ReturnType<typeof requireAuthOrApiKeyWithOrg>>,
  mcpId: string,
  secretId: string
): AuditContext {
  return {
    actorType: authResult.apiKey ? "api_key" : "user",
    actorId: authResult.apiKey?.id || authResult.user.id,
    actorEmail: authResult.user.email,
    ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined,
    userAgent: request.headers.get("user-agent") || undefined,
    source: authResult.apiKey ? "api" : "dashboard",
    endpoint: `/api/v1/mcps/${mcpId}/secrets/${secretId}`,
  };
}

/**
 * GET /api/v1/mcps/[mcpId]/secrets/[secretId]
 * Get a secret's decrypted value
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ mcpId: string; secretId: string }> }
) {
  const authResult = await requireAuthOrApiKeyWithOrg(request);
  const { mcpId, secretId } = await ctx.params;

  // Verify the user owns this MCP
  const mcp = await userMcpsService.getById(mcpId);
  if (!mcp || mcp.organization_id !== authResult.user.organization_id) {
    return NextResponse.json(
      { success: false, error: "MCP not found or access denied" },
      { status: 404 }
    );
  }

  if (!secretsService.isConfigured) {
    return NextResponse.json(
      { success: false, error: "Secrets service is not configured" },
      { status: 503 }
    );
  }

  // Verify the secret belongs to this MCP
  const secretMeta = await secretsRepository.findById(secretId);
  if (
    !secretMeta ||
    secretMeta.organization_id !== authResult.user.organization_id ||
    secretMeta.project_id !== mcpId
  ) {
    return NextResponse.json(
      { success: false, error: "Secret not found" },
      { status: 404 }
    );
  }

  const auditContext = buildAuditContext(request, authResult, mcpId, secretId);

  const value = await secretsService.get(
    authResult.user.organization_id,
    secretMeta.name,
    mcpId,
    secretMeta.environment as "development" | "preview" | "production" | undefined,
    auditContext
  );

  if (value === null) {
    return NextResponse.json(
      { success: false, error: "Secret not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    id: secretMeta.id,
    name: secretMeta.name,
    value,
    description: secretMeta.description,
    environment: secretMeta.environment,
    version: secretMeta.version,
    lastAccessedAt: new Date().toISOString(),
  });
}

/**
 * PATCH /api/v1/mcps/[mcpId]/secrets/[secretId]
 * Update a secret's value or metadata
 */
export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ mcpId: string; secretId: string }> }
) {
  const authResult = await requireAuthOrApiKeyWithOrg(request);
  const { mcpId, secretId } = await ctx.params;

  // Verify the user owns this MCP
  const mcp = await userMcpsService.getById(mcpId);
  if (!mcp || mcp.organization_id !== authResult.user.organization_id) {
    return NextResponse.json(
      { success: false, error: "MCP not found or access denied" },
      { status: 404 }
    );
  }

  if (!secretsService.isConfigured) {
    return NextResponse.json(
      { success: false, error: "Secrets service is not configured" },
      { status: 503 }
    );
  }

  // Verify the secret belongs to this MCP
  const secretMeta = await secretsRepository.findById(secretId);
  if (
    !secretMeta ||
    secretMeta.organization_id !== authResult.user.organization_id ||
    secretMeta.project_id !== mcpId
  ) {
    return NextResponse.json(
      { success: false, error: "Secret not found" },
      { status: 404 }
    );
  }

  const body = await request.json();
  const validation = updateSecretSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      { success: false, error: "Invalid request", details: validation.error.flatten() },
      { status: 400 }
    );
  }

  const data = validation.data;
  const auditContext = buildAuditContext(request, authResult, mcpId, secretId);

  const updated = await secretsService.update(
    secretId,
    authResult.user.organization_id,
    {
      value: data.value,
      description: data.description,
    },
    auditContext
  );

  return NextResponse.json({
    success: true,
    id: updated.id,
    name: updated.name,
    description: updated.description,
    environment: updated.environment,
    version: updated.version,
    updatedAt: updated.updatedAt.toISOString(),
  });
}

/**
 * DELETE /api/v1/mcps/[mcpId]/secrets/[secretId]
 * Delete a secret
 */
export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ mcpId: string; secretId: string }> }
) {
  const authResult = await requireAuthOrApiKeyWithOrg(request);
  const { mcpId, secretId } = await ctx.params;

  // Verify the user owns this MCP
  const mcp = await userMcpsService.getById(mcpId);
  if (!mcp || mcp.organization_id !== authResult.user.organization_id) {
    return NextResponse.json(
      { success: false, error: "MCP not found or access denied" },
      { status: 404 }
    );
  }

  if (!secretsService.isConfigured) {
    return NextResponse.json(
      { success: false, error: "Secrets service is not configured" },
      { status: 503 }
    );
  }

  // Verify the secret belongs to this MCP
  const secretMeta = await secretsRepository.findById(secretId);
  if (
    !secretMeta ||
    secretMeta.organization_id !== authResult.user.organization_id ||
    secretMeta.project_id !== mcpId
  ) {
    return NextResponse.json(
      { success: false, error: "Secret not found" },
      { status: 404 }
    );
  }

  const auditContext = buildAuditContext(request, authResult, mcpId, secretId);

  await secretsService.delete(secretId, authResult.user.organization_id, auditContext);

  return NextResponse.json({ success: true });
}


/**
 * MCP Secrets API
 *
 * Manages encrypted secrets scoped to a specific MCP.
 * These secrets are automatically injected when MCP requests are proxied.
 *
 * GET /api/v1/mcps/[mcpId]/secrets - List secrets for this MCP
 * POST /api/v1/mcps/[mcpId]/secrets - Create a new secret for this MCP
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { secretsService, type AuditContext } from "@/lib/services/secrets";
import { userMcpsService } from "@/lib/services/user-mcps";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const createSecretSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(256)
    .regex(
      /^[A-Z][A-Z0-9_]*$/,
      "Secret name must be uppercase with underscores (e.g., MY_API_KEY)"
    ),
  value: z.string().min(1).max(65536),
  description: z.string().max(1024).optional(),
  environment: z.enum(["development", "preview", "production"]).optional(),
});

/**
 * GET /api/v1/mcps/[mcpId]/secrets
 * List secrets for a specific MCP (metadata only)
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ mcpId: string }> }
) {
  const authResult = await requireAuthOrApiKeyWithOrg(request);
  const { mcpId } = await ctx.params;

  // Verify the user owns this MCP
  const mcp = await userMcpsService.getById(mcpId);
  if (!mcp || mcp.organization_id !== authResult.user.organization_id) {
    return NextResponse.json(
      { success: false, error: "MCP not found or access denied" },
      { status: 404 }
    );
  }

  const secrets = await secretsService.listByProject(mcpId);

  return NextResponse.json({
    success: true,
    mcpId,
    mcpName: mcp.name,
    secrets: secrets.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      environment: s.environment,
      version: s.version,
      lastAccessedAt: s.lastAccessedAt?.toISOString(),
      accessCount: s.accessCount,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    })),
    total: secrets.length,
  });
}

/**
 * POST /api/v1/mcps/[mcpId]/secrets
 * Create a new secret scoped to this MCP
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ mcpId: string }> }
) {
  const authResult = await requireAuthOrApiKeyWithOrg(request);
  const { mcpId } = await ctx.params;

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

  const body = await request.json();
  const validation = createSecretSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      { success: false, error: "Invalid request", details: validation.error.flatten() },
      { status: 400 }
    );
  }

  const data = validation.data;

  const auditContext: AuditContext = {
    actorType: authResult.apiKey ? "api_key" : "user",
    actorId: authResult.apiKey?.id || authResult.user.id,
    actorEmail: authResult.user.email,
    ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined,
    userAgent: request.headers.get("user-agent") || undefined,
    source: authResult.apiKey ? "api" : "dashboard",
    endpoint: `/api/v1/mcps/${mcpId}/secrets`,
  };

  const secret = await secretsService.create(
    {
      organizationId: authResult.user.organization_id,
      name: data.name,
      value: data.value,
      description: data.description,
      scope: "project",
      projectId: mcpId,
      projectType: "mcp",
      environment: data.environment,
      createdBy: authResult.user.id,
    },
    auditContext
  );

  return NextResponse.json({
    success: true,
    id: secret.id,
    name: secret.name,
    description: secret.description,
    environment: secret.environment,
    version: secret.version,
    createdAt: secret.createdAt.toISOString(),
  });
}


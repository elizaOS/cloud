/**
 * Individual Secret API
 *
 * GET /api/v1/secrets/[secretId] - Get secret value (decrypted)
 * PATCH /api/v1/secrets/[secretId] - Update secret
 * DELETE /api/v1/secrets/[secretId] - Delete secret
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { secretsService, type AuditContext } from "@/lib/services/secrets";
import { secretsRepository } from "@/db/repositories/secrets";

export const maxDuration = 30;

// Request schemas
const updateSecretSchema = z.object({
  value: z.string().min(1).max(65536).optional(),
  description: z.string().max(1024).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

function buildAuditContext(
  request: NextRequest,
  authResult: Awaited<ReturnType<typeof requireAuthOrApiKeyWithOrg>>,
  endpoint: string
): AuditContext {
  return {
    actorType: authResult.apiKey ? "api_key" : "user",
    actorId: authResult.apiKey?.id || authResult.user.id,
    actorEmail: authResult.user.email,
    ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined,
    userAgent: request.headers.get("user-agent") || undefined,
    source: authResult.apiKey ? "api" : "dashboard",
    endpoint,
  };
}

/**
 * GET /api/v1/secrets/[secretId]
 * Get a secret's decrypted value
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ secretId: string }> }
) {
  const authResult = await requireAuthOrApiKeyWithOrg(request);
  const { secretId } = await ctx.params;

  if (!secretsService.isConfigured) {
    return NextResponse.json(
      { error: "Secrets service is not configured" },
      { status: 503 }
    );
  }

  // Verify the secret belongs to this organization
  const secretMeta = await secretsRepository.findById(secretId);
  if (!secretMeta || secretMeta.organization_id !== authResult.user.organization_id) {
    return NextResponse.json({ error: "Secret not found" }, { status: 404 });
  }

  const auditContext = buildAuditContext(request, authResult, `/api/v1/secrets/${secretId}`);

  // Get the decrypted value
  const value = await secretsService.get(
    authResult.user.organization_id,
    secretMeta.name,
    secretMeta.project_id || undefined,
    secretMeta.environment as "development" | "preview" | "production" | undefined,
    auditContext
  );

  if (value === null) {
    return NextResponse.json({ error: "Secret not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: secretMeta.id,
    name: secretMeta.name,
    value,
    description: secretMeta.description,
    scope: secretMeta.scope,
    projectId: secretMeta.project_id,
    environment: secretMeta.environment,
    version: secretMeta.version,
    expiresAt: secretMeta.expires_at?.toISOString(),
    lastAccessedAt: new Date().toISOString(),
  });
}

/**
 * PATCH /api/v1/secrets/[secretId]
 * Update a secret's value or metadata
 */
export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ secretId: string }> }
) {
  const authResult = await requireAuthOrApiKeyWithOrg(request);
  const { secretId } = await ctx.params;

  if (!secretsService.isConfigured) {
    return NextResponse.json(
      { error: "Secrets service is not configured" },
      { status: 503 }
    );
  }

  const body = await request.json();
  const validation = updateSecretSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      { error: "Invalid request", details: validation.error.flatten() },
      { status: 400 }
    );
  }

  const data = validation.data;
  const auditContext = buildAuditContext(request, authResult, `/api/v1/secrets/${secretId}`);

  const updated = await secretsService.update(
    secretId,
    authResult.user.organization_id,
    {
      value: data.value,
      description: data.description,
      expiresAt: data.expiresAt === null ? null : data.expiresAt ? new Date(data.expiresAt) : undefined,
    },
    auditContext
  );

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    description: updated.description,
    scope: updated.scope,
    projectId: updated.projectId,
    environment: updated.environment,
    version: updated.version,
    updatedAt: updated.updatedAt.toISOString(),
  });
}

/**
 * DELETE /api/v1/secrets/[secretId]
 * Delete a secret
 */
export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ secretId: string }> }
) {
  const authResult = await requireAuthOrApiKeyWithOrg(request);
  const { secretId } = await ctx.params;

  if (!secretsService.isConfigured) {
    return NextResponse.json(
      { error: "Secrets service is not configured" },
      { status: 503 }
    );
  }

  const auditContext = buildAuditContext(request, authResult, `/api/v1/secrets/${secretId}`);

  await secretsService.delete(secretId, authResult.user.organization_id, auditContext);

  return NextResponse.json({ success: true });
}


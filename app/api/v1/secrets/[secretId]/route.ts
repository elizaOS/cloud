/**
 * Individual Secret API - GET, PATCH, DELETE operations
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { secretsService, isSecretsConfigured, type AuditContext } from "@/lib/services/secrets";
import { secretsRepository } from "@/db/repositories/secrets";

export const maxDuration = 30;

const UpdateSchema = z.object({
  value: z.string().min(1).max(65536).optional(),
  description: z.string().max(1024).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

type RouteContext = { params: Promise<{ secretId: string }> };

function buildAuditContext(request: NextRequest, authResult: Awaited<ReturnType<typeof requireAuthOrApiKeyWithOrg>>): AuditContext {
  return {
    actorType: authResult.apiKey ? "api_key" : "user",
    actorId: authResult.apiKey?.id ?? authResult.user.id,
    actorEmail: authResult.user.email,
    ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
    source: authResult.apiKey ? "api" : "dashboard",
  };
}

function assertConfigured() {
  if (!isSecretsConfigured()) {
    throw new Error("Secrets service not configured");
  }
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthOrApiKeyWithOrg(request);
  const { secretId } = await params;

  assertConfigured();

  const secretMeta = await secretsRepository.findById(secretId);
  if (!secretMeta || secretMeta.organization_id !== authResult.user.organization_id) {
    return NextResponse.json({ error: "Secret not found" }, { status: 404 });
  }

  const value = await secretsService.get(
    authResult.user.organization_id,
    secretMeta.name,
    secretMeta.project_id ?? undefined,
    secretMeta.environment as "development" | "preview" | "production" | undefined,
    buildAuditContext(request, authResult)
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

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthOrApiKeyWithOrg(request);
  const { secretId } = await params;

  assertConfigured();

  const parsed = UpdateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const updated = await secretsService.update(
    secretId,
    authResult.user.organization_id,
    {
      value: parsed.data.value,
      description: parsed.data.description,
      expiresAt: parsed.data.expiresAt === null ? null : parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined,
    },
    buildAuditContext(request, authResult)
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

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthOrApiKeyWithOrg(request);
  const { secretId } = await params;

  assertConfigured();

  await secretsService.delete(secretId, authResult.user.organization_id, buildAuditContext(request, authResult));
  return NextResponse.json({ success: true });
}

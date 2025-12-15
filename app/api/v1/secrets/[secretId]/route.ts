import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { secretsService, isSecretsConfigured } from "@/lib/services/secrets";
import { secretsRepository } from "@/db/repositories/secrets";
import { buildDetailedAudit } from "@/lib/api/secrets-helpers";

export const maxDuration = 30;

const UpdateSchema = z.object({
  value: z.string().min(1).max(65536).optional(),
  description: z.string().max(1024).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

type RouteContext = { params: Promise<{ secretId: string }> };

function assertConfigured() {
  if (!isSecretsConfigured()) throw new Error("Secrets service not configured");
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthOrApiKeyWithOrg(request);
  const { secretId } = await params;

  assertConfigured();

  const secretMeta = await secretsRepository.findById(secretId);
  if (
    !secretMeta ||
    secretMeta.organization_id !== authResult.user.organization_id
  ) {
    return NextResponse.json({ error: "Secret not found" }, { status: 404 });
  }

  const value = await secretsService.get(
    authResult.user.organization_id,
    secretMeta.name,
    secretMeta.project_id ?? undefined,
    secretMeta.environment as
      | "development"
      | "preview"
      | "production"
      | undefined,
    buildDetailedAudit(request, authResult),
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
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updated = await secretsService.update(
    secretId,
    authResult.user.organization_id,
    {
      value: parsed.data.value,
      description: parsed.data.description,
      expiresAt:
        parsed.data.expiresAt === null
          ? null
          : parsed.data.expiresAt
            ? new Date(parsed.data.expiresAt)
            : undefined,
    },
    buildDetailedAudit(request, authResult),
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

  await secretsService.delete(
    secretId,
    authResult.user.organization_id,
    buildAuditContext(request, authResult),
  );
  return NextResponse.json({ success: true });
}

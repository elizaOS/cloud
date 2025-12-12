/**
 * Individual Character Secret API
 *
 * GET /api/my-agents/characters/[id]/secrets/[secretId] - Get secret value
 * PATCH /api/my-agents/characters/[id]/secrets/[secretId] - Update secret
 * DELETE /api/my-agents/characters/[id]/secrets/[secretId] - Delete secret
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthWithOrg } from "@/lib/auth";
import { secretsService, isSecretsConfigured, type AuditContext } from "@/lib/services/secrets";
import { secretsRepository } from "@/db/repositories/secrets";
import { charactersService } from "@/lib/services/characters";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const updateSecretSchema = z.object({
  value: z.string().min(1).max(65536).optional(),
  description: z.string().max(1024).optional(),
});

function buildAuditContext(
  request: NextRequest,
  user: { id: string; email: string },
  characterId: string,
  secretId: string
): AuditContext {
  return {
    actorType: "user",
    actorId: user.id,
    actorEmail: user.email,
    ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined,
    userAgent: request.headers.get("user-agent") || undefined,
    source: "dashboard",
    endpoint: `/api/my-agents/characters/${characterId}/secrets/${secretId}`,
  };
}

/**
 * GET /api/my-agents/characters/[id]/secrets/[secretId]
 * Get a secret's decrypted value
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; secretId: string }> }
) {
  const user = await requireAuthWithOrg();
  const { id: characterId, secretId } = await params;

  // Verify the user owns this character
  const character = await charactersService.getById(characterId);
  if (!character || character.organization_id !== user.organization_id) {
    return NextResponse.json(
      { success: false, error: "Character not found or access denied" },
      { status: 404 }
    );
  }

  if (!isSecretsConfigured()) {
    return NextResponse.json(
      { success: false, error: "Secrets service is not configured" },
      { status: 503 }
    );
  }

  // Verify the secret belongs to this character
  const secretMeta = await secretsRepository.findById(secretId);
  if (
    !secretMeta ||
    secretMeta.organization_id !== user.organization_id ||
    secretMeta.project_id !== characterId
  ) {
    return NextResponse.json(
      { success: false, error: "Secret not found" },
      { status: 404 }
    );
  }

  const auditContext = buildAuditContext(request, user, characterId, secretId);

  const value = await secretsService.get(
    user.organization_id,
    secretMeta.name,
    characterId,
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
 * PATCH /api/my-agents/characters/[id]/secrets/[secretId]
 * Update a secret's value or metadata
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; secretId: string }> }
) {
  const user = await requireAuthWithOrg();
  const { id: characterId, secretId } = await params;

  // Verify the user owns this character
  const character = await charactersService.getById(characterId);
  if (!character || character.organization_id !== user.organization_id) {
    return NextResponse.json(
      { success: false, error: "Character not found or access denied" },
      { status: 404 }
    );
  }

  if (!isSecretsConfigured()) {
    return NextResponse.json(
      { success: false, error: "Secrets service is not configured" },
      { status: 503 }
    );
  }

  // Verify the secret belongs to this character
  const secretMeta = await secretsRepository.findById(secretId);
  if (
    !secretMeta ||
    secretMeta.organization_id !== user.organization_id ||
    secretMeta.project_id !== characterId
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
  const auditContext = buildAuditContext(request, user, characterId, secretId);

  const updated = await secretsService.update(
    secretId,
    user.organization_id,
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
 * DELETE /api/my-agents/characters/[id]/secrets/[secretId]
 * Delete a secret
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; secretId: string }> }
) {
  const user = await requireAuthWithOrg();
  const { id: characterId, secretId } = await params;

  // Verify the user owns this character
  const character = await charactersService.getById(characterId);
  if (!character || character.organization_id !== user.organization_id) {
    return NextResponse.json(
      { success: false, error: "Character not found or access denied" },
      { status: 404 }
    );
  }

  if (!isSecretsConfigured()) {
    return NextResponse.json(
      { success: false, error: "Secrets service is not configured" },
      { status: 503 }
    );
  }

  // Verify the secret belongs to this character
  const secretMeta = await secretsRepository.findById(secretId);
  if (
    !secretMeta ||
    secretMeta.organization_id !== user.organization_id ||
    secretMeta.project_id !== characterId
  ) {
    return NextResponse.json(
      { success: false, error: "Secret not found" },
      { status: 404 }
    );
  }

  const auditContext = buildAuditContext(request, user, characterId, secretId);

  await secretsService.delete(secretId, user.organization_id, auditContext);

  return NextResponse.json({ success: true });
}


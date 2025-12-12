/**
 * Character/Agent Secrets API
 *
 * Manages encrypted secrets scoped to a specific character/agent.
 * These secrets are automatically available when the agent runs.
 *
 * GET /api/my-agents/characters/[id]/secrets - List secrets for this character
 * POST /api/my-agents/characters/[id]/secrets - Create a new secret for this character
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthWithOrg } from "@/lib/auth";
import { secretsService, type AuditContext } from "@/lib/services/secrets";
import { charactersService } from "@/lib/services/characters";

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
 * GET /api/my-agents/characters/[id]/secrets
 * List secrets for a specific character (metadata only)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuthWithOrg();
  const { id: characterId } = await params;

  // Verify the user owns this character
  const character = await charactersService.getById(characterId);
  if (!character || character.organization_id !== user.organization_id) {
    return NextResponse.json(
      { success: false, error: "Character not found or access denied" },
      { status: 404 }
    );
  }

  const secrets = await secretsService.listByProject(characterId);

  return NextResponse.json({
    success: true,
    characterId,
    characterName: character.name,
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
 * POST /api/my-agents/characters/[id]/secrets
 * Create a new secret scoped to this character
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuthWithOrg();
  const { id: characterId } = await params;

  // Verify the user owns this character
  const character = await charactersService.getById(characterId);
  if (!character || character.organization_id !== user.organization_id) {
    return NextResponse.json(
      { success: false, error: "Character not found or access denied" },
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
    actorType: "user",
    actorId: user.id,
    actorEmail: user.email,
    ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined,
    userAgent: request.headers.get("user-agent") || undefined,
    source: "dashboard",
    endpoint: `/api/my-agents/characters/${characterId}/secrets`,
  };

  const secret = await secretsService.create(
    {
      organizationId: user.organization_id,
      name: data.name,
      value: data.value,
      description: data.description,
      scope: "project",
      projectId: characterId,
      projectType: "character",
      environment: data.environment,
      createdBy: user.id,
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


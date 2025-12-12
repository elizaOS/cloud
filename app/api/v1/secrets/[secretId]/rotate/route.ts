/**
 * Secret Rotation API
 *
 * POST /api/v1/secrets/[secretId]/rotate - Rotate a secret's value
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { secretsService, isSecretsConfigured, type AuditContext } from "@/lib/services/secrets";
import { logger } from "@/lib/utils/logger";

export const maxDuration = 30;

const rotateSecretSchema = z.object({
  newValue: z.string().min(1).max(65536),
});

/**
 * POST /api/v1/secrets/[secretId]/rotate
 * Rotate a secret with a new value (increments version)
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ secretId: string }> }
) {
  const authResult = await requireAuthOrApiKeyWithOrg(request);
  const { secretId } = await ctx.params;

  if (!isSecretsConfigured()) {
    return NextResponse.json(
      { error: "Secrets service is not configured" },
      { status: 503 }
    );
  }

  const body = await request.json();
  const validation = rotateSecretSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      { error: "Invalid request", details: validation.error.flatten() },
      { status: 400 }
    );
  }

  const auditContext: AuditContext = {
    actorType: authResult.apiKey ? "api_key" : "user",
    actorId: authResult.apiKey?.id || authResult.user.id,
    actorEmail: authResult.user.email,
    ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined,
    userAgent: request.headers.get("user-agent") || undefined,
    source: authResult.apiKey ? "api" : "dashboard",
    endpoint: `/api/v1/secrets/${secretId}/rotate`,
  };

  const rotated = await secretsService.rotate(
    secretId,
    authResult.user.organization_id,
    validation.data.newValue,
    auditContext
  );

  logger.info("[Secrets API] Rotated secret", {
    secretId,
    newVersion: rotated.version,
    org: authResult.user.organization_id,
  });

  return NextResponse.json({
    id: rotated.id,
    name: rotated.name,
    version: rotated.version,
    lastRotatedAt: rotated.lastRotatedAt?.toISOString(),
    updatedAt: rotated.updatedAt.toISOString(),
  });
}


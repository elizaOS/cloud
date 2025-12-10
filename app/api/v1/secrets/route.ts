/**
 * Secrets API - Encrypted key-value storage
 *
 * Works via session, API key, or app token auth.
 *
 * GET  /api/v1/secrets - List secrets (names only)
 * GET  /api/v1/secrets?name=X - Get specific secret value
 * POST /api/v1/secrets - Create secret
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { secretsService, type AuditContext } from "@/lib/services/secrets";
import { logger } from "@/lib/utils/logger";

export async function GET(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const name = request.nextUrl.searchParams.get("name");
  const appId = request.headers.get("X-App-Id") || undefined;
  
  if (name) {
    const value = await secretsService.get(user.organization_id, name, appId);
    return NextResponse.json(value ? { name, value } : { name, found: false });
  }

  const secrets = await secretsService.list(user.organization_id);
  return NextResponse.json({
    secrets: secrets.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      createdAt: s.createdAt.toISOString(),
      lastAccessedAt: s.lastAccessedAt?.toISOString(),
    })),
  });
}

const CreateSchema = z.object({
  name: z.string().min(1).max(255),
  value: z.string().min(1),
  description: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const appId = request.headers.get("X-App-Id") || undefined;

  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const audit: AuditContext = { actorType: "user", actorId: user.id, source: "secrets-api" };
  const secret = await secretsService.create({
    organizationId: user.organization_id,
    name: parsed.data.name,
    value: parsed.data.value,
    description: parsed.data.description,
    scope: appId ? "project" : "organization",
    projectType: appId,
    createdBy: user.id,
  }, audit);

  logger.info("[Secrets] Created", { name: parsed.data.name, userId: user.id });
  return NextResponse.json({ id: secret.id, name: secret.name }, { status: 201 });
}

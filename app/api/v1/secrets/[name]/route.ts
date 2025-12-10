/**
 * Individual Secret API
 *
 * GET    /api/v1/secrets/[name] - Get secret value
 * PATCH  /api/v1/secrets/[name] - Update secret
 * DELETE /api/v1/secrets/[name] - Delete secret
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { secretsService, type AuditContext } from "@/lib/services/secrets";
import { logger } from "@/lib/utils/logger";

export async function GET(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { name } = await params;
  const appId = request.headers.get("X-App-Id") || undefined;

  const value = await secretsService.get(user.organization_id, decodeURIComponent(name), appId);
  if (!value) return NextResponse.json({ error: "Secret not found" }, { status: 404 });
  
  return NextResponse.json({ name: decodeURIComponent(name), value });
}

const UpdateSchema = z.object({
  value: z.string().min(1).optional(),
  description: z.string().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { name } = await params;
  const secretName = decodeURIComponent(name);
  
  const secrets = await secretsService.list(user.organization_id);
  const secret = secrets.find(s => s.name === secretName);
  if (!secret) return NextResponse.json({ error: "Secret not found" }, { status: 404 });

  const body = await request.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const audit: AuditContext = { actorType: "user", actorId: user.id, source: "secrets-api" };
  await secretsService.update(secret.id, user.organization_id, parsed.data, audit);
  
  logger.info("[Secrets] Updated", { name: secretName, userId: user.id });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { name } = await params;
  const secretName = decodeURIComponent(name);

  const secrets = await secretsService.list(user.organization_id);
  const secret = secrets.find(s => s.name === secretName);
  if (!secret) return NextResponse.json({ error: "Secret not found" }, { status: 404 });

  const audit: AuditContext = { actorType: "user", actorId: user.id, source: "secrets-api" };
  await secretsService.delete(secret.id, user.organization_id, audit);
  
  logger.info("[Secrets] Deleted", { name: secretName, userId: user.id });
  return NextResponse.json({ success: true });
}

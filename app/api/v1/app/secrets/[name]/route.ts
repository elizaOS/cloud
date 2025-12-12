/**
 * App Secret by Name API
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { secretsService, type AuditContext } from "@/lib/services/secrets";
import { appsService } from "@/lib/services/apps";
import { logger } from "@/lib/utils/logger";

type RouteParams = { params: Promise<{ name: string }> };

async function getAppContext(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const appId = request.headers.get("X-App-Id");
  if (!appId) throw new Error("X-App-Id header required");
  const app = await appsService.getById(user.organization_id, appId);
  if (!app) throw new Error("App not found");
  return { app, user, audit: { actorType: "user", actorId: user.id, source: "app-secrets-api" } as AuditContext };
}

function handleError(error: unknown, operation: string) {
  const message = error instanceof Error ? error.message : `Failed to ${operation}`;
  logger.error(`[App Secrets] ${operation} failed`, { error: message });
  if (message.includes("header required")) return NextResponse.json({ error: message }, { status: 400 });
  if (message.includes("not found")) return NextResponse.json({ error: message }, { status: 404 });
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { app, audit } = await getAppContext(request);
    const { name } = await params;
    const secrets = await secretsService.getAppSecrets(app.id, app.organization_id, audit);
    const value = secrets[name];
    return NextResponse.json(value !== undefined ? { name, value } : { name, found: false });
  } catch (error) {
    return handleError(error, "GET");
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { app, audit } = await getAppContext(request);
    const { name } = await params;
    const secrets = await secretsService.list(app.organization_id);
    const secret = secrets.find(s => s.name === name && s.projectId === app.id);
    if (!secret) return NextResponse.json({ error: "Secret not found" }, { status: 404 });

    await secretsService.delete(secret.id, app.organization_id, audit);
    logger.info("[App Secrets] Deleted", { name, appId: app.id });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error, "DELETE");
  }
}


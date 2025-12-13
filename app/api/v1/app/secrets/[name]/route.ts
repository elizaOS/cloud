/**
 * App Secret by Name API
 */

import { NextRequest, NextResponse } from "next/server";
import { secretsService } from "@/lib/services/secrets";
import { logger } from "@/lib/utils/logger";
import { getAppContext, handleSecretsError } from "@/lib/api/secrets-helpers";

type RouteParams = { params: Promise<{ name: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { app, audit } = await getAppContext(request);
    const { name } = await params;
    const secrets = await secretsService.getAppSecrets(app.id, app.organization_id, audit);
    const value = secrets[name];
    return NextResponse.json(value !== undefined ? { name, value } : { name, found: false });
  } catch (error) {
    return handleSecretsError(error, "App Secrets");
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
    return handleSecretsError(error, "App Secrets");
  }
}

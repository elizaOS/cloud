/**
 * App Secrets API - Access secrets for the current app
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { secretsService, type AuditContext } from "@/lib/services/secrets";
import { appsService } from "@/lib/services/apps";
import { logger } from "@/lib/utils/logger";

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
  if (message.includes("already exists")) return NextResponse.json({ error: message }, { status: 409 });
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const { app, audit } = await getAppContext(request);
    const secrets = await secretsService.getAppSecrets(app.id, app.organization_id, audit);
    return NextResponse.json({
      secrets: Object.entries(secrets).map(([name, value]) => ({ name, value })),
    });
  } catch (error) {
    return handleError(error, "GET");
  }
}

const CreateSchema = z.object({
  name: z.string().min(1).max(255),
  value: z.string().min(1),
  description: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const { app, user, audit } = await getAppContext(request);
    const parsed = CreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", details: parsed.error.format() }, { status: 400 });
    }

    const secret = await secretsService.create({
      organizationId: app.organization_id,
      name: parsed.data.name,
      value: parsed.data.value,
      description: parsed.data.description,
      scope: "project",
      projectId: app.id,
      projectType: "app",
      createdBy: user.id,
    }, audit);

    logger.info("[App Secrets] Created", { name: parsed.data.name, appId: app.id });
    return NextResponse.json({ id: secret.id, name: secret.name }, { status: 201 });
  } catch (error) {
    return handleError(error, "POST");
  }
}


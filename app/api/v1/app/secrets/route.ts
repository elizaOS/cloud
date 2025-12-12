/**
 * App Secrets API - Access secrets for the current app
 *
 * GET  /api/v1/app/secrets - List approved secrets for this app
 * POST /api/v1/app/secrets - Create a secret (app-scoped)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { secretsService, type AuditContext } from "@/lib/services/secrets";
import { appsService } from "@/lib/services/apps";
import { logger } from "@/lib/utils/logger";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const appId = request.headers.get("X-App-Id");
    if (!appId) {
      return NextResponse.json({ error: "X-App-Id header required" }, { status: 400 });
    }

    const app = await appsService.getById(user.organization_id, appId);
    if (!app) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }

    const audit: AuditContext = { actorType: "user", actorId: user.id, source: "app-secrets-api" };
    const secrets = await secretsService.getAppSecrets(app.id, app.organization_id, audit);

    return NextResponse.json({
      secrets: Object.entries(secrets).map(([name, value]) => ({ name, value })),
    });
  } catch (error) {
    logger.error("[App Secrets] GET failed", { error: error instanceof Error ? error.message : error });
    return NextResponse.json({ error: "Failed to get secrets" }, { status: 500 });
  }
}

const CreateSchema = z.object({
  name: z.string().min(1).max(255),
  value: z.string().min(1),
  description: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const appId = request.headers.get("X-App-Id");
    if (!appId) {
      return NextResponse.json({ error: "X-App-Id header required" }, { status: 400 });
    }

    const app = await appsService.getById(user.organization_id, appId);
    if (!app) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }

    const body = await request.json();
    const audit: AuditContext = { actorType: "user", actorId: user.id, source: "app-secrets-api" };

    const parsed = CreateSchema.safeParse(body);
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

    logger.info("[App Secrets] Created", { name: parsed.data.name, appId: app.id, userId: user.id });
    return NextResponse.json({ id: secret.id, name: secret.name }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create secret";
    logger.error("[App Secrets] POST failed", { error: message });
    if (message.includes("already exists")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


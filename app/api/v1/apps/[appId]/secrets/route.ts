/**
 * App Secret Requirements API
 *
 * GET  /api/v1/apps/:appId/secrets - List secret requirements for an app
 * POST /api/v1/apps/:appId/secrets - Sync secret requirements from app manifest
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { secretsService } from "@/lib/services/secrets";
import { appsService } from "@/lib/services/apps";
import { logger } from "@/lib/utils/logger";

type RouteParams = { params: Promise<{ appId: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { appId } = await params;

  // Verify app belongs to org
  const app = await appsService.getById(appId);
  if (!app || app.organization_id !== user.organization_id) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  const requirements = await secretsService.getAppSecretRequirements(appId);

  return NextResponse.json({
    requirements: requirements.map((r) => ({
      id: r.id,
      secretName: r.secret_name,
      required: r.required,
      approved: r.approved,
      approvedBy: r.approved_by,
      approvedAt: r.approved_at?.toISOString(),
      createdAt: r.created_at.toISOString(),
    })),
  });
}

const SyncSchema = z.object({
  requirements: z.array(z.object({
    secretName: z.string().min(1),
    required: z.boolean().optional().default(true),
  })),
});

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { appId } = await params;

  // Verify app belongs to org
  const app = await appsService.getById(appId);
  if (!app || app.organization_id !== user.organization_id) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = SyncSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.format() }, { status: 400 });
  }

  const requirements = await secretsService.syncAppSecretRequirements(
    appId,
    parsed.data.requirements
  );

  logger.info("[App Secrets] Synced requirements", { appId, count: requirements.length });

  return NextResponse.json({
    requirements: requirements.map((r) => ({
      id: r.id,
      secretName: r.secret_name,
      required: r.required,
      approved: r.approved,
      approvedBy: r.approved_by,
      approvedAt: r.approved_at?.toISOString(),
      createdAt: r.created_at.toISOString(),
    })),
  });
}


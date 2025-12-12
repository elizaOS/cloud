/**
 * Secret Bindings API - Attach org-level secrets to projects
 *
 * GET  /api/v1/secrets/bindings?projectId=X&projectType=Y - List bindings for a project
 * POST /api/v1/secrets/bindings - Bind secret(s) to a project
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { secretsService, type AuditContext } from "@/lib/services/secrets";
import { logger } from "@/lib/utils/logger";
import type { SecretProjectType } from "@/db/schemas/secrets";

const VALID_PROJECT_TYPES: SecretProjectType[] = [
  "character", "app", "workflow", "container", "mcp"
];

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const searchParams = request.nextUrl.searchParams;
    
    const projectId = searchParams.get("projectId");
    const projectType = searchParams.get("projectType") as SecretProjectType | undefined;
    const secretId = searchParams.get("secretId");
    const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500);
    const offset = parseInt(searchParams.get("offset") || "0");

    if (!projectId && !secretId) {
      return NextResponse.json({ error: "Either projectId or secretId query param required" }, { status: 400 });
    }

    if (secretId) {
      const bindings = await secretsService.listSecretBindings(secretId);
      return NextResponse.json({ bindings });
    }

    if (projectType && !VALID_PROJECT_TYPES.includes(projectType)) {
      return NextResponse.json({ error: `Invalid projectType` }, { status: 400 });
    }

    const result = await secretsService.listBindings(user.organization_id, projectId!, projectType, limit, offset);
    return NextResponse.json({ bindings: result.bindings, total: result.total, limit, offset });
  } catch (error) {
    logger.error("[Secrets] GET bindings failed", { error: error instanceof Error ? error.message : error });
    return NextResponse.json({ error: "Failed to list bindings" }, { status: 500 });
  }
}

const BindSchema = z.object({
  secretId: z.string().uuid(),
  projectId: z.string().uuid(),
  projectType: z.enum(VALID_PROJECT_TYPES as [SecretProjectType, ...SecretProjectType[]]),
});

const BulkBindSchema = z.object({
  secretIds: z.array(z.string().uuid()).min(1).max(50),
  projectId: z.string().uuid(),
  projectType: z.enum(VALID_PROJECT_TYPES as [SecretProjectType, ...SecretProjectType[]]),
});

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const body = await request.json();
    const audit: AuditContext = { actorType: "user", actorId: user.id, source: "secrets-bindings-api" };

    if (body.secretIds && Array.isArray(body.secretIds)) {
      const parsed = BulkBindSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request", details: parsed.error.format() }, { status: 400 });
      }

      const result = await secretsService.bindSecrets(
        parsed.data.secretIds,
        parsed.data.projectId,
        parsed.data.projectType,
        user.id,
        audit
      );

      logger.info("[Secrets] Bulk bound", { count: result.bound.length, userId: user.id });
      return NextResponse.json({ bound: result.bound, errors: result.errors }, { status: 201 });
    }

    const parsed = BindSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", details: parsed.error.format() }, { status: 400 });
    }

    const binding = await secretsService.bindSecret({
      secretId: parsed.data.secretId,
      projectId: parsed.data.projectId,
      projectType: parsed.data.projectType,
      createdBy: user.id,
    }, audit);

    logger.info("[Secrets] Bound", { secretId: parsed.data.secretId, projectId: parsed.data.projectId, userId: user.id });
    return NextResponse.json({ binding }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to bind secret";
    logger.error("[Secrets] POST binding failed", { error: message });
    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message.includes("already bound")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


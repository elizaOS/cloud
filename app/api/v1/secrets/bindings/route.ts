import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { secretsService, type AuditContext } from "@/lib/services/secrets";
import { logger } from "@/lib/utils/logger";
import { secretProjectTypeEnum, type SecretProjectType } from "@/db/schemas/secrets";

const PROJECT_TYPES = secretProjectTypeEnum.enumValues;

const BindSchema = z.object({
  secretId: z.string().uuid(),
  projectId: z.string().uuid(),
  projectType: z.enum(PROJECT_TYPES),
});

const BulkBindSchema = z.object({
  secretIds: z.array(z.string().uuid()).min(1).max(50),
  projectId: z.string().uuid(),
  projectType: z.enum(PROJECT_TYPES),
});

function handleError(error: unknown) {
  const message = error instanceof Error ? error.message : "Operation failed";
  logger.error("[Secrets] Binding operation failed", { error: message });
  if (message.includes("not found")) return NextResponse.json({ error: message }, { status: 404 });
  if (message.includes("already bound")) return NextResponse.json({ error: message }, { status: 409 });
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const params = request.nextUrl.searchParams;
    const projectId = params.get("projectId");
    const projectType = params.get("projectType") as SecretProjectType | undefined;
    const secretId = params.get("secretId");

    if (!projectId && !secretId) {
      return NextResponse.json({ error: "projectId or secretId required" }, { status: 400 });
    }
    if (secretId) {
      return NextResponse.json({ bindings: await secretsService.listSecretBindings(secretId) });
    }
    if (projectType && !PROJECT_TYPES.includes(projectType)) {
      return NextResponse.json({ error: "Invalid projectType" }, { status: 400 });
    }

    const limit = Math.min(parseInt(params.get("limit") || "100"), 500);
    const offset = parseInt(params.get("offset") || "0");
    const result = await secretsService.listBindings(user.organization_id, projectId!, projectType, limit, offset);
    return NextResponse.json({ ...result, limit, offset });
  } catch (error) {
    return handleError(error);
  }
}

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
        parsed.data.secretIds, parsed.data.projectId, parsed.data.projectType, user.id, audit
      );
      logger.info("[Secrets] Bulk bound", { count: result.bound.length });
      return NextResponse.json(result, { status: 201 });
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
    logger.info("[Secrets] Bound", { secretId: parsed.data.secretId, projectId: parsed.data.projectId });
    return NextResponse.json({ binding }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}


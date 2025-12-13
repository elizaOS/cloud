import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { secretsService } from "@/lib/services/secrets";
import { logger } from "@/lib/utils/logger";
import {
  secretProviderEnum,
  secretProjectTypeEnum,
  secretEnvironmentEnum,
  type SecretProvider,
  type SecretProjectType,
  type SecretEnvironment,
} from "@/db/schemas/secrets";
import { createAudit, handleSecretsError, formatSecret } from "@/lib/api/secrets-helpers";

const PROVIDERS = secretProviderEnum.enumValues;
const PROJECT_TYPES = secretProjectTypeEnum.enumValues;
const ENVIRONMENTS = secretEnvironmentEnum.enumValues;

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const searchParams = request.nextUrl.searchParams;
    const name = searchParams.get("name");
    const appId = request.headers.get("X-App-Id");
    
    if (name) {
      const value = await secretsService.get(user.organization_id, name, appId);
      return NextResponse.json(value ? { name, value } : { name, found: false });
    }

    const projectId = searchParams.get("projectId") || undefined;
    const projectType = searchParams.get("projectType") as SecretProjectType | undefined;
    const environment = searchParams.get("environment") as SecretEnvironment | undefined;
    const provider = searchParams.get("provider") as SecretProvider | undefined;
    const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500);
    const offset = parseInt(searchParams.get("offset") || "0");

    if (provider && !PROVIDERS.includes(provider)) {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    }
    if (projectType && !PROJECT_TYPES.includes(projectType)) {
      return NextResponse.json({ error: "Invalid projectType" }, { status: 400 });
    }
    if (environment && !ENVIRONMENTS.includes(environment)) {
      return NextResponse.json({ error: "Invalid environment" }, { status: 400 });
    }

    const result = await secretsService.listFiltered({
      organizationId: user.organization_id,
      projectId,
      projectType,
      environment,
      provider,
      limit,
      offset,
    });

    return NextResponse.json({
      secrets: result.secrets.map(formatSecret),
      total: result.total,
      limit,
      offset,
    });
  } catch (error) {
    return handleSecretsError(error, "Secrets");
  }
}

const CreateSchema = z.object({
  name: z.string().min(1).max(255),
  value: z.string().min(1),
  description: z.string().optional(),
  provider: z.enum(PROVIDERS).optional(),
  projectId: z.string().uuid().optional(),
  projectType: z.enum(PROJECT_TYPES).optional(),
  environment: z.enum(ENVIRONMENTS).optional(),
});

const BulkCreateSchema = z.object({
  secrets: z.array(z.object({
    name: z.string().min(1).max(255),
    value: z.string().min(1),
    description: z.string().optional(),
    provider: z.enum(PROVIDERS).optional(),
  })).min(1).max(100),
});

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const appId = request.headers.get("X-App-Id");
    const body = await request.json();
    const audit = createAudit(user, "secrets-api");

    if (body.secrets && Array.isArray(body.secrets)) {
      const parsed = BulkCreateSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request", details: parsed.error.format() }, { status: 400 });
      }

      const result = await secretsService.bulkCreate({
        organizationId: user.organization_id,
        secrets: parsed.data.secrets,
        createdBy: user.id,
      }, audit);

      logger.info("[Secrets] Bulk created", { count: result.created.length, userId: user.id });
      return NextResponse.json({
        created: result.created.map(s => ({ id: s.id, name: s.name })),
        errors: result.errors,
      }, { status: 201 });
    }

    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", details: parsed.error.format() }, { status: 400 });
    }

    const secret = await secretsService.create({
      organizationId: user.organization_id,
      name: parsed.data.name,
      value: parsed.data.value,
      description: parsed.data.description,
      provider: parsed.data.provider,
      scope: (parsed.data.projectId || appId) ? "project" : "organization",
      projectId: parsed.data.projectId || appId,
      projectType: parsed.data.projectType || (appId ? "app" : undefined),
      environment: parsed.data.environment,
      createdBy: user.id,
    }, audit);

    logger.info("[Secrets] Created", { name: parsed.data.name, userId: user.id });
    return NextResponse.json({ id: secret.id, name: secret.name }, { status: 201 });
  } catch (error) {
    return handleSecretsError(error, "Secrets");
  }
}

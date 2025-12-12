/**
 * Secrets API - Encrypted key-value storage
 *
 * Works via session, API key, or app token auth.
 *
 * GET  /api/v1/secrets - List secrets with optional filters
 * GET  /api/v1/secrets?name=X - Get specific secret value
 * POST /api/v1/secrets - Create secret or bulk create
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { secretsService, type AuditContext } from "@/lib/services/secrets";
import { logger } from "@/lib/utils/logger";
import type { SecretProvider, SecretProjectType, SecretEnvironment } from "@/db/schemas/secrets";

const VALID_PROVIDERS: SecretProvider[] = [
  "openai", "anthropic", "google", "elevenlabs", "fal", "stripe",
  "discord", "telegram", "twitter", "github", "slack", "aws", "vercel", "custom"
];

const VALID_PROJECT_TYPES: SecretProjectType[] = [
  "character", "app", "workflow", "container", "mcp"
];

const VALID_ENVIRONMENTS: SecretEnvironment[] = [
  "development", "preview", "production"
];

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const searchParams = request.nextUrl.searchParams;
    const name = searchParams.get("name");
    const appId = request.headers.get("X-App-Id") || undefined;
    
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

    if (provider && !VALID_PROVIDERS.includes(provider)) {
      return NextResponse.json({ error: `Invalid provider` }, { status: 400 });
    }
    if (projectType && !VALID_PROJECT_TYPES.includes(projectType)) {
      return NextResponse.json({ error: `Invalid projectType` }, { status: 400 });
    }
    if (environment && !VALID_ENVIRONMENTS.includes(environment)) {
      return NextResponse.json({ error: `Invalid environment` }, { status: 400 });
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
      secrets: result.secrets.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        scope: s.scope,
        projectId: s.projectId,
        projectType: s.projectType,
        environment: s.environment,
        provider: s.provider,
        version: s.version,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
        lastAccessedAt: s.lastAccessedAt?.toISOString(),
        accessCount: s.accessCount,
      })),
      total: result.total,
      limit,
      offset,
    });
  } catch (error) {
    logger.error("[Secrets] GET failed", { error: error instanceof Error ? error.message : error });
    return NextResponse.json({ error: "Failed to list secrets" }, { status: 500 });
  }
}

const CreateSchema = z.object({
  name: z.string().min(1).max(255),
  value: z.string().min(1),
  description: z.string().optional(),
  provider: z.enum(VALID_PROVIDERS as [SecretProvider, ...SecretProvider[]]).optional(),
  projectId: z.string().uuid().optional(),
  projectType: z.enum(VALID_PROJECT_TYPES as [SecretProjectType, ...SecretProjectType[]]).optional(),
  environment: z.enum(VALID_ENVIRONMENTS as [SecretEnvironment, ...SecretEnvironment[]]).optional(),
});

const BulkCreateSchema = z.object({
  secrets: z.array(z.object({
    name: z.string().min(1).max(255),
    value: z.string().min(1),
    description: z.string().optional(),
    provider: z.enum(VALID_PROVIDERS as [SecretProvider, ...SecretProvider[]]).optional(),
  })).min(1).max(100),
});

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const appId = request.headers.get("X-App-Id") || undefined;
    const body = await request.json();
    const audit: AuditContext = { actorType: "user", actorId: user.id, source: "secrets-api" };

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
    const message = error instanceof Error ? error.message : "Failed to create secret";
    logger.error("[Secrets] POST failed", { error: message });
    if (message.includes("already exists")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

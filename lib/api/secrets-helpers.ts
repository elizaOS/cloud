/**
 * Shared helpers for secrets API routes
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { appsService } from "@/lib/services/apps";
import { logger } from "@/lib/utils/logger";
import type { AuditContext, SecretMetadata } from "@/lib/services/secrets";
import type { AppSecretRequirement } from "@/db/schemas/secrets";

export type AuthResult = Awaited<ReturnType<typeof requireAuthOrApiKeyWithOrg>>;

export interface AppContext {
  app: NonNullable<Awaited<ReturnType<typeof appsService.getById>>>;
  user: AuthResult["user"];
  audit: AuditContext;
}

/**
 * Get app context from X-App-Id header (for miniapp SDK)
 */
export async function getAppContext(request: NextRequest): Promise<AppContext> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const appId = request.headers.get("X-App-Id");
  if (!appId) throw new Error("X-App-Id header required");
  const app = await appsService.getById(user.organization_id, appId);
  if (!app) throw new Error("App not found");
  return {
    app,
    user,
    audit: { actorType: "user", actorId: user.id, source: "app-secrets-api" },
  };
}

/**
 * Verify app ownership and return app (for app management routes)
 */
export async function verifyAppOwnership(appId: string, organizationId: string) {
  const app = await appsService.getById(organizationId, appId);
  if (!app) throw new Error("App not found");
  return app;
}

/**
 * Create audit context from auth result
 */
export function createAudit(user: AuthResult["user"], source: string): AuditContext {
  return { actorType: "user", actorId: user.id, source };
}

/**
 * Format app secret requirement for API response
 */
export function formatRequirement(r: AppSecretRequirement) {
  return {
    id: r.id,
    secretName: r.secret_name,
    required: r.required,
    approved: r.approved,
    approvedBy: r.approved_by,
    approvedAt: r.approved_at?.toISOString(),
    createdAt: r.created_at.toISOString(),
  };
}

/**
 * Format secret metadata for API response
 */
export function formatSecret(s: SecretMetadata) {
  return {
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
  };
}

/**
 * Build detailed audit context (for individual secret operations)
 */
export function buildDetailedAudit(request: NextRequest, authResult: AuthResult): AuditContext {
  return {
    actorType: authResult.apiKey ? "api_key" : "user",
    actorId: authResult.apiKey?.id ?? authResult.user.id,
    actorEmail: authResult.user.email,
    ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
    source: authResult.apiKey ? "api" : "dashboard",
  };
}

/**
 * Handle API errors with appropriate status codes
 */
export function handleSecretsError(error: unknown, context?: string): NextResponse {
  const message = error instanceof Error ? error.message : "Operation failed";
  const logContext = context ? `[${context}]` : "[Secrets]";
  logger.error(`${logContext} Operation failed`, { error: message });

  if (message.includes("header required")) {
    return NextResponse.json({ error: message }, { status: 400 });
  }
  if (message.includes("not found")) {
    return NextResponse.json({ error: message }, { status: 404 });
  }
  if (message.includes("already exists") || message.includes("already bound")) {
    return NextResponse.json({ error: message }, { status: 409 });
  }
  return NextResponse.json({ error: message }, { status: 500 });
}


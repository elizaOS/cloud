/**
 * Secret Audit Log API
 *
 * GET /api/v1/secrets/audit - Get audit log for organization secrets
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { secretsService } from "@/lib/services/secrets";

export const maxDuration = 30;

/**
 * GET /api/v1/secrets/audit
 * Get audit log for organization secrets
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuthOrApiKeyWithOrg(request);

  const limit = Math.min(
    parseInt(request.nextUrl.searchParams.get("limit") || "100", 10),
    1000
  );
  
  const secretId = request.nextUrl.searchParams.get("secretId");

  const auditLog = secretId
    ? await secretsService.getSecretAuditLog(secretId, limit)
    : await secretsService.getOrganizationAuditLog(authResult.user.organization_id, limit);

  return NextResponse.json({
    entries: auditLog.map((entry) => ({
      id: entry.id,
      secretId: entry.secret_id,
      oauthSessionId: entry.oauth_session_id,
      action: entry.action,
      secretName: entry.secret_name,
      actorType: entry.actor_type,
      actorId: entry.actor_id,
      actorEmail: entry.actor_email,
      ipAddress: entry.ip_address,
      source: entry.source,
      endpoint: entry.endpoint,
      requestId: entry.request_id,
      metadata: entry.metadata,
      createdAt: entry.created_at.toISOString(),
    })),
    total: auditLog.length,
  });
}


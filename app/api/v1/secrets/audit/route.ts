/**
 * Secret Audit Log API
 *
 * GET /api/v1/secrets/audit - Get audit log for organization
 * GET /api/v1/secrets/audit?secretId=X - Get audit log for specific secret
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { secretsService } from "@/lib/services/secrets";
import type { SecretAuditLog } from "@/db/schemas/secrets";

const formatEntry = (e: SecretAuditLog) => ({
  id: e.id,
  secretId: e.secret_id,
  secretName: e.secret_name,
  action: e.action,
  actorType: e.actor_type,
  actorId: e.actor_id,
  actorEmail: e.actor_email,
  source: e.source,
  ipAddress: e.ip_address,
  createdAt: e.created_at.toISOString(),
});

export async function GET(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { searchParams } = request.nextUrl;
  
  const secretId = searchParams.get("secretId");
  const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 1000);

  const entries = secretId
    ? await secretsService.getSecretAuditLog(secretId, limit)
    : await secretsService.getOrganizationAuditLog(user.organization_id, limit);

  return NextResponse.json({ entries: entries.map(formatEntry) });
}

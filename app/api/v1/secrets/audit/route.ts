import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { secretsService } from "@/lib/services/secrets";
import { formatAuditEntry } from "@/lib/api/secrets-helpers";

export async function GET(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { searchParams } = request.nextUrl;
  
  const secretId = searchParams.get("secretId");
  const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 1000);

  const entries = secretId
    ? await secretsService.getSecretAuditLog(secretId, limit)
    : await secretsService.getOrganizationAuditLog(user.organization_id, limit);

  return NextResponse.json({ entries: entries.map(formatAuditEntry) });
}

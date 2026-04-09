import { NextRequest, NextResponse } from "next/server";

import { dbWrite } from "@/packages/db/helpers";
import { organizations } from "@/packages/db/schemas/organizations";
import { getCurrentUser } from "@/lib/auth";
import { logger } from "@/lib/utils/logger";
import { eq } from "drizzle-orm";

const STEWARD_API_URL = process.env.STEWARD_API_URL ?? "http://localhost:3200";
const STEWARD_PLATFORM_KEYS = process.env.STEWARD_PLATFORM_KEYS ?? "";

function getPlatformKey(): string {
  const key = STEWARD_PLATFORM_KEYS.split(",")[0].trim();
  if (!key) throw new Error("STEWARD_PLATFORM_KEYS is not configured");
  return key;
}

/**
 * POST /api/v1/steward/tenants
 *
 * Provisions a new Steward tenant for the authenticated user's organization.
 * Idempotent: if the org already has a Steward tenant, returns the existing ID.
 *
 * This endpoint is called automatically during organization setup when
 * Steward-backed auth is enabled for the organization.
 *
 * Body: { organizationId: string; tenantName?: string }
 * Returns: { tenantId: string; isNew: boolean }
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as { organizationId?: string; tenantName?: string };
  if (!body.organizationId) {
    return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
  }

  const [org] = await dbWrite
    .select({
      id: organizations.id,
      slug: organizations.slug,
      stewardTenantId: organizations.steward_tenant_id,
    })
    .from(organizations)
    .where(eq(organizations.id, body.organizationId))
    .limit(1);

  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  // Idempotent — already provisioned
  if (org.stewardTenantId) {
    return NextResponse.json({ tenantId: org.stewardTenantId, isNew: false });
  }

  const tenantId = `elizacloud-${org.slug}`;
  const tenantName = body.tenantName ?? `ElizaCloud — ${org.slug}`;

  let platformKey: string;
  try {
    platformKey = getPlatformKey();
  } catch {
    logger.error("[steward-tenants] STEWARD_PLATFORM_KEYS not configured");
    return NextResponse.json({ error: "Steward not configured" }, { status: 503 });
  }

  const stewardRes = await fetch(`${STEWARD_API_URL}/platform/tenants`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Steward-Platform-Key": platformKey,
    },
    body: JSON.stringify({ id: tenantId, name: tenantName }),
  });

  const stewardData = await stewardRes.json() as {
    ok: boolean;
    apiKey?: string;
    data?: { apiKey?: string };
    error?: string;
  };

  if (stewardRes.status === 409) {
    // Tenant already exists in Steward but not linked in our DB — re-link without API key
    logger.warn(`[steward-tenants] Tenant ${tenantId} already exists in Steward, linking org`);
    await dbWrite
      .update(organizations)
      .set({ steward_tenant_id: tenantId })
      .where(eq(organizations.id, org.id));
    return NextResponse.json({ tenantId, isNew: false });
  }

  if (!stewardRes.ok || !stewardData.ok) {
    logger.error("[steward-tenants] Failed to create Steward tenant", { error: stewardData.error });
    return NextResponse.json({ error: "Failed to provision Steward tenant" }, { status: 502 });
  }

  const apiKey = stewardData.apiKey ?? stewardData.data?.apiKey ?? "";

  await dbWrite
    .update(organizations)
    .set({ steward_tenant_id: tenantId, steward_tenant_api_key: apiKey })
    .where(eq(organizations.id, org.id));

  logger.info(`[steward-tenants] Provisioned tenant ${tenantId} for org ${org.id}`);
  return NextResponse.json({ tenantId, isNew: true }, { status: 201 });
}

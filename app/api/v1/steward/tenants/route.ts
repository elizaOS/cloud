import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getErrorStatusCode } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { provisionStewardTenantForOrganization } from "@/lib/services/steward-tenant-provisioning";
import { logger } from "@/lib/utils/logger";
import { dbWrite } from "@/packages/db/helpers";
import { organizations } from "@/packages/db/schemas/organizations";

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
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(req);

    const body = (await req.json()) as {
      organizationId?: string;
      tenantName?: string;
    };
    if (!body.organizationId) {
      return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
    }
    if (body.organizationId !== user.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

    try {
      const result = await provisionStewardTenantForOrganization(org.id, {
        tenantName: body.tenantName ?? `ElizaCloud - ${org.slug}`,
      });
      return NextResponse.json(
        { tenantId: result.tenantId, isNew: result.isNew },
        { status: result.isNew ? 201 : 200 },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes("STEWARD_PLATFORM_KEYS is not configured")) {
        logger.error("[steward-tenants] STEWARD_PLATFORM_KEYS not configured");
        return NextResponse.json({ error: "Steward not configured" }, { status: 503 });
      }

      logger.error("[steward-tenants] Failed to create Steward tenant", { error: message });
      return NextResponse.json({ error: "Failed to provision Steward tenant" }, { status: 502 });
    }
  } catch (error) {
    const status = getErrorStatusCode(error);
    if (status >= 500) {
      logger.error("[steward-tenants] Unexpected error", { error });
    }
    if (status === 401) {
      return NextResponse.json({ error: "Unauthorized" }, { status });
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status },
    );
  }
}

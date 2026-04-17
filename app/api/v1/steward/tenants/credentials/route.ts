import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getErrorStatusCode } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { logger } from "@/lib/utils/logger";
import { dbWrite } from "@/packages/db/helpers";
import { organizations } from "@/packages/db/schemas/organizations";

/**
 * GET /api/v1/steward/tenants/credentials
 *
 * Returns Steward tenant credentials for the authenticated user's org.
 * Called by the desktop agent after cloud login to configure Steward locally.
 */
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(req);

    const [org] = await dbWrite
      .select({
        id: organizations.id,
        stewardTenantId: organizations.steward_tenant_id,
        stewardTenantApiKey: organizations.steward_tenant_api_key,
      })
      .from(organizations)
      .where(eq(organizations.id, user.organization_id))
      .limit(1);

    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }

    if (!org.stewardTenantId) {
      return NextResponse.json(
        { error: "Steward not provisioned for this organization" },
        { status: 404 },
      );
    }

    const stewardApiUrl =
      process.env.STEWARD_API_URL ?? "http://localhost:3200";

    return NextResponse.json({
      tenantId: org.stewardTenantId,
      apiKey: org.stewardTenantApiKey ?? "",
      stewardApiUrl,
    });
  } catch (error) {
    const status = getErrorStatusCode(error);
    if (status >= 500) {
      logger.error("[steward-credentials] Unexpected error", { error });
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

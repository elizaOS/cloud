import { eq } from "drizzle-orm";
import { dbWrite } from "@/packages/db/helpers";
import { organizations } from "@/packages/db/schemas/organizations";
import { logger } from "@/lib/utils/logger";

function getStewardApiUrl(): string {
  return process.env.STEWARD_API_URL ?? "http://localhost:3200";
}

function getPlatformKey(): string {
  const key = (process.env.STEWARD_PLATFORM_KEYS ?? "").split(",")[0]?.trim();
  if (!key) {
    throw new Error("STEWARD_PLATFORM_KEYS is not configured");
  }
  return key;
}

export interface ProvisionStewardTenantResult {
  tenantId: string;
  isNew: boolean;
  apiKeyStored: boolean;
}

export async function provisionStewardTenantForOrganization(
  organizationId: string,
  options?: { tenantName?: string },
): Promise<ProvisionStewardTenantResult> {
  const [org] = await dbWrite
    .select({
      id: organizations.id,
      slug: organizations.slug,
      stewardTenantId: organizations.steward_tenant_id,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!org) {
    throw new Error(`Organization not found: ${organizationId}`);
  }

  if (org.stewardTenantId) {
    return {
      tenantId: org.stewardTenantId,
      isNew: false,
      apiKeyStored: Boolean(org.stewardTenantId),
    };
  }

  const tenantId = `elizacloud-${org.slug}`;
  const tenantName = options?.tenantName ?? `ElizaCloud - ${org.slug}`;
  const platformKey = getPlatformKey();

  const stewardRes = await fetch(`${getStewardApiUrl()}/platform/tenants`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Steward-Platform-Key": platformKey,
    },
    body: JSON.stringify({ id: tenantId, name: tenantName }),
  });

  const stewardData = (await stewardRes.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    apiKey?: string;
    data?: { apiKey?: string };
  };

  if (stewardRes.status === 409) {
    logger.warn(`[steward-tenants] Tenant ${tenantId} already exists in Steward, linking org`);
    await dbWrite
      .update(organizations)
      .set({
        steward_tenant_id: tenantId,
        updated_at: new Date(),
      })
      .where(eq(organizations.id, org.id));

    return {
      tenantId,
      isNew: false,
      apiKeyStored: false,
    };
  }

  if (!stewardRes.ok || !stewardData.ok) {
    throw new Error(
      stewardData.error ||
        `Failed to provision Steward tenant ${tenantId} for org ${organizationId}`,
    );
  }

  const apiKey = stewardData.apiKey ?? stewardData.data?.apiKey ?? "";

  await dbWrite
    .update(organizations)
    .set({
      steward_tenant_id: tenantId,
      steward_tenant_api_key: apiKey,
      updated_at: new Date(),
    })
    .where(eq(organizations.id, org.id));

  logger.info(`[steward-tenants] Provisioned tenant ${tenantId} for org ${org.id}`);

  return {
    tenantId,
    isNew: true,
    apiKeyStored: Boolean(apiKey),
  };
}

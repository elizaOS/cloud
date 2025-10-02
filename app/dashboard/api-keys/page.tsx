import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { listApiKeys } from "@/lib/queries/api-keys";
import { ApiKeysPage as ApiKeysPageView } from "@/components/api-keys/api-keys-page";
import type {
  ApiKeyDisplay,
  ApiKeyStatus,
  ApiKeysSummaryData,
} from "@/components/api-keys/types";

export const metadata: Metadata = {
  title: "API Keys",
  description:
    "Manage your API keys and authentication credentials for ElizaOS platform",
};

function getApiKeyStatus(isActive: boolean, expiresAt: Date | null): ApiKeyStatus {
  if (!isActive) return "inactive";
  if (expiresAt && new Date(expiresAt) < new Date()) return "expired";
  return "active";
}

export default async function ApiKeysPage() {
  const user = await requireAuth();
  const keys = await listApiKeys(user.organization_id);

  const displayKeys: ApiKeyDisplay[] = keys.map((key) => ({
    id: key.id,
    name: key.name,
    description: key.description,
    keyPrefix: key.key_prefix,
    status: getApiKeyStatus(key.is_active, key.expires_at),
    lastUsedAt: key.last_used_at?.toISOString() ?? null,
    createdAt: key.created_at.toISOString(),
    permissions: key.permissions,
    usageCount: key.usage_count,
    rateLimit: key.rate_limit,
    expiresAt: key.expires_at?.toISOString() ?? null,
  }));

  const summary: ApiKeysSummaryData = {
    totalKeys: displayKeys.length,
    activeKeys: displayKeys.filter((key) => key.status === "active").length,
    monthlyUsage: displayKeys.reduce(
      (accumulator, key) => accumulator + key.usageCount,
      0
    ),
    rateLimit: 1000,
    lastGeneratedAt: displayKeys[0]?.createdAt ?? null,
  };

  return <ApiKeysPageView keys={displayKeys} summary={summary} />;
}


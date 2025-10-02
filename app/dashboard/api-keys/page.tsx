import type { Metadata } from "next";

import { ApiKeysPage as ApiKeysPageView } from "@/components/api-keys/api-keys-page";
import type {
  ApiKeyDisplay,
  ApiKeysSummaryData,
} from "@/components/api-keys/types";

export const metadata: Metadata = {
  title: "API Keys",
  description:
    "Manage your API keys and authentication credentials for ElizaOS platform",
};

const placeholderKeys: ApiKeyDisplay[] = [
  {
    id: "demo-1",
    name: "Production backend",
    description: "Used by the public API services",
    keyPrefix: "eliza_prod_",
    status: "active" as const,
    lastUsedAt: new Date().toISOString(),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString(),
    permissions: ["Text generation", "Image generation", "Usage"],
    usageCount: 18245,
    rateLimit: 1000,
    expiresAt: null,
  },
  {
    id: "demo-2",
    name: "Staging integration",
    description: "Internal staging environment",
    keyPrefix: "eliza_stg_",
    status: "inactive" as const,
    lastUsedAt: null,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 45).toISOString(),
    permissions: ["Text generation", "Usage"],
    usageCount: 420,
    rateLimit: 500,
    expiresAt: null,
  },
];

const placeholderSummary: ApiKeysSummaryData = {
  totalKeys: placeholderKeys.length,
  activeKeys: placeholderKeys.filter((key) => key.status === "active").length,
  monthlyUsage: placeholderKeys.reduce(
    (accumulator, key) => accumulator + key.usageCount,
    0
  ),
  rateLimit: 1000,
  lastGeneratedAt: placeholderKeys[0]?.createdAt ?? null,
};

export default function ApiKeysPage() {
  return <ApiKeysPageView keys={placeholderKeys} summary={placeholderSummary} />;
}


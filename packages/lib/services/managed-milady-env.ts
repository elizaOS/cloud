import crypto from "node:crypto";
import { apiKeysService } from "./api-keys";
import { resolveStewardContainerUrl } from "./docker-sandbox-utils";

const DEFAULT_MILADY_APP_URL = "https://app.milady.ai";
const DEFAULT_CLOUD_PUBLIC_URL = "https://www.elizacloud.ai";
const DEV_MILADY_APP_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
] as const;

export interface ManagedMiladyEnvironmentResult {
  apiToken: string;
  changed: boolean;
  environmentVars: Record<string, string>;
  userApiKey: string;
}

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

function resolveMiladyAppUrl(): string {
  return normalizeBaseUrl(
    process.env.NEXT_PUBLIC_MILADY_APP_URL || process.env.MILADY_APP_URL || DEFAULT_MILADY_APP_URL,
  );
}

function resolveCloudPublicUrl(): string {
  return normalizeBaseUrl(
    process.env.NEXT_PUBLIC_APP_URL || process.env.ELIZA_CLOUD_URL || DEFAULT_CLOUD_PUBLIC_URL,
  );
}

function parseOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function buildManagedAllowedOrigins(): string[] {
  const origins = new Set<string>();
  const appOrigin = parseOrigin(resolveMiladyAppUrl());
  const cloudOrigin = parseOrigin(resolveCloudPublicUrl());
  if (appOrigin) origins.add(appOrigin);
  if (cloudOrigin) origins.add(cloudOrigin);

  if (process.env.NODE_ENV !== "production") {
    for (const origin of DEV_MILADY_APP_ORIGINS) {
      origins.add(origin);
    }
  }

  const extraOrigins = process.env.MILADY_MANAGED_ALLOWED_ORIGINS;
  if (extraOrigins) {
    for (const item of extraOrigins.split(",")) {
      const trimmed = item.trim();
      if (!trimmed) continue;
      const normalized = parseOrigin(trimmed);
      if (normalized) origins.add(normalized);
    }
  }

  return [...origins];
}

function mergeAllowedOrigins(existingValue?: string): string {
  const merged = new Set<string>();
  if (existingValue) {
    for (const entry of existingValue.split(",")) {
      const trimmed = entry.trim();
      if (!trimmed) continue;
      const origin = parseOrigin(trimmed);
      if (origin) merged.add(origin);
    }
  }

  for (const origin of buildManagedAllowedOrigins()) {
    merged.add(origin);
  }

  return [...merged].join(",");
}

function isActiveApiKeyForUser(
  key: {
    user_id: string;
    is_active: boolean;
    expires_at: Date | null;
    key: string;
  },
  userId: string,
): boolean {
  if (key.user_id !== userId || !key.is_active || !key.key?.trim()) {
    return false;
  }

  return !key.expires_at || new Date(key.expires_at).getTime() > Date.now();
}

async function getOrCreateUserApiKey(userId: string, organizationId: string): Promise<string> {
  const existingKeys = await apiKeysService.listByOrganization(organizationId);
  const existingKey = existingKeys.find((key) => isActiveApiKeyForUser(key, userId));
  if (existingKey) {
    return existingKey.key;
  }

  const { plainKey } = await apiKeysService.create({
    name: "Eliza Cloud Managed Access",
    description: "Auto-generated for managed Milady instances on Eliza Cloud",
    organization_id: organizationId,
    user_id: userId,
    permissions: [],
    rate_limit: 1000,
    is_active: true,
    expires_at: null,
  });

  return plainKey;
}

export async function prepareManagedMiladyEnvironment(params: {
  existingEnv?: Record<string, string> | null;
  organizationId: string;
  userId: string;
  /** Sandbox/agent ID — used as STEWARD_AGENT_ID for Docker-backed agents. */
  sandboxId?: string;
}): Promise<ManagedMiladyEnvironmentResult> {
  const existingEnv = { ...(params.existingEnv ?? {}) };
  const userApiKey = await getOrCreateUserApiKey(params.userId, params.organizationId);
  const apiToken =
    existingEnv.MILADY_API_TOKEN?.trim() || `milady_${crypto.randomUUID().replace(/-/g, "")}`;

  const environmentVars: Record<string, string> = {
    ...existingEnv,
    MILADY_API_TOKEN: apiToken,
    MILADY_ALLOW_WS_QUERY_TOKEN: "1",
    MILADY_ALLOWED_ORIGINS: mergeAllowedOrigins(existingEnv.MILADY_ALLOWED_ORIGINS),
    ELIZAOS_API_KEY: userApiKey,
    ELIZAOS_CLOUD_API_KEY: userApiKey,
    ELIZAOS_CLOUD_ENABLED: "true",
    ELIZAOS_CLOUD_BASE_URL: `${resolveCloudPublicUrl()}/api/v1`,
  };

  // Steward env vars — Docker-backed agents need these to talk to the wallet vault.
  // STEWARD_API_URL is resolved for container reachability (host.docker.internal
  // or the explicit override). STEWARD_AGENT_ID maps to the sandbox ID.
  // STEWARD_AGENT_TOKEN is set during provisioning in docker-sandbox-provider.ts.
  const stewardContainerUrl = resolveStewardContainerUrl(
    process.env.STEWARD_API_URL || "http://localhost:3200",
    process.env.STEWARD_CONTAINER_URL,
  );

  if (!existingEnv.STEWARD_API_URL) {
    environmentVars.STEWARD_API_URL = stewardContainerUrl;
  }
  if (params.sandboxId && !existingEnv.STEWARD_AGENT_ID) {
    environmentVars.STEWARD_AGENT_ID = params.sandboxId;
  }

  const changed = JSON.stringify(existingEnv) !== JSON.stringify(environmentVars);

  return {
    apiToken,
    changed,
    environmentVars,
    userApiKey,
  };
}

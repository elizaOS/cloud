import crypto from "node:crypto";
import { miladySandboxesRepository } from "@/db/repositories/milady-sandboxes";
import type { MiladySandbox } from "@/db/schemas/milady-sandboxes";
import { cache } from "@/lib/cache/client";
import { logger } from "@/lib/utils/logger";
import { apiKeysService } from "./api-keys";
import { miladySandboxService } from "./milady-sandbox";

const DEFAULT_MILADY_APP_URL = "https://app.milady.ai";
const DEFAULT_CLOUD_PUBLIC_URL = "https://www.elizacloud.ai";
const DEFAULT_SMALL_MODEL = "moonshotai/kimi-k2-turbo";
const DEFAULT_LARGE_MODEL = "moonshotai/kimi-k2-0905";
const LAUNCH_SESSION_TTL_SECONDS = 300;
const DEV_MILADY_APP_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
] as const;

export interface ManagedLaunchConnection {
  apiBase: string;
  token: string;
}

export interface ManagedLaunchSessionPayload {
  agentId: string;
  agentName: string;
  connection: ManagedLaunchConnection;
  issuedAt: string;
}

export interface ManagedLaunchResult extends ManagedLaunchSessionPayload {
  appUrl: string;
  launchSessionId: string | null;
}

export interface ManagedMiladyEnvironmentResult {
  apiToken: string;
  changed: boolean;
  environmentVars: Record<string, string>;
  userApiKey: string;
}

export class ManagedMiladyLaunchError extends Error {
  constructor(
    message: string,
    readonly status = 500,
  ) {
    super(message);
    this.name = "ManagedMiladyLaunchError";
  }
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

function resolveAgentBaseDomain(): string | null {
  const configured = process.env.ELIZA_CLOUD_AGENT_BASE_DOMAIN?.trim();
  if (!configured) return null;
  return configured
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.+$/, "");
}

function resolveManagedAgentApiBase(sandbox: MiladySandbox): string | null {
  const configuredDomain = resolveAgentBaseDomain();
  if (configuredDomain) {
    return `https://${sandbox.id}.${configuredDomain}`;
  }

  if (sandbox.health_url?.trim()) {
    return normalizeBaseUrl(sandbox.health_url);
  }

  const port = sandbox.web_ui_port ?? sandbox.bridge_port;
  if (sandbox.headscale_ip && port) {
    return `http://${sandbox.headscale_ip}:${port}`;
  }

  return null;
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

  for (const origin of DEV_MILADY_APP_ORIGINS) {
    origins.add(origin);
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

async function requestManagedAgent(
  apiBase: string,
  token: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${normalizeBaseUrl(apiBase)}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
}

async function ensureManagedOnboarding(
  sandbox: MiladySandbox,
  apiBase: string,
  token: string,
  userApiKey: string,
): Promise<void> {
  const statusResponse = await requestManagedAgent(apiBase, token, "/api/onboarding/status");

  if (!statusResponse.ok) {
    throw new ManagedMiladyLaunchError(
      `Failed to read onboarding status (HTTP ${statusResponse.status})`,
      502,
    );
  }

  const onboardingStatus = (await statusResponse.json()) as { complete?: boolean };
  if (onboardingStatus.complete) {
    return;
  }

  const onboardingBody = {
    name: sandbox.agent_name?.trim() || "Milady",
    runMode: "cloud" as const,
    sandboxMode: "light" as const,
    bio: ["An autonomous AI agent running on Eliza Cloud."],
    systemPrompt: `You are ${sandbox.agent_name?.trim() || "Milady"}, an autonomous AI agent running on Eliza Cloud.`,
    cloudProvider: "elizacloud",
    providerApiKey: userApiKey,
    smallModel: DEFAULT_SMALL_MODEL,
    largeModel: DEFAULT_LARGE_MODEL,
    inventoryProviders: [
      { chain: "evm", rpcProvider: "eliza-cloud" },
      { chain: "bsc", rpcProvider: "eliza-cloud" },
      { chain: "solana", rpcProvider: "eliza-cloud" },
    ],
  };

  const onboardingResponse = await requestManagedAgent(apiBase, token, "/api/onboarding", {
    method: "POST",
    body: JSON.stringify(onboardingBody),
  });

  if (!onboardingResponse.ok) {
    const text = await onboardingResponse.text().catch(() => "");
    throw new ManagedMiladyLaunchError(
      `Failed to bootstrap managed onboarding (HTTP ${onboardingResponse.status})${text ? `: ${text.slice(0, 200)}` : ""}`,
      502,
    );
  }

  // Best-effort runtime restart so the persisted cloud config is loaded
  // before the web app attaches to this backend.
  await requestManagedAgent(apiBase, token, "/api/agent/restart", {
    method: "POST",
  }).catch((error) => {
    logger.warn("[milady-managed-launch] Agent restart after onboarding failed", {
      agentId: sandbox.id,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

export async function prepareManagedMiladyEnvironment(params: {
  existingEnv?: Record<string, string> | null;
  organizationId: string;
  userId: string;
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
    ELIZAOS_CLOUD_BASE_URL: resolveCloudPublicUrl(),
  };

  const changed = JSON.stringify(existingEnv) !== JSON.stringify(environmentVars);

  return {
    apiToken,
    changed,
    environmentVars,
    userApiKey,
  };
}

export function resolveLaunchSessionCacheKey(sessionId: string): string {
  return `milady:launch-session:${sessionId}`;
}

export function resolveMiladyLaunchAllowedOrigins(): string[] {
  return buildManagedAllowedOrigins();
}

export async function launchManagedMiladyAgent(params: {
  agentId: string;
  organizationId: string;
  userId: string;
}): Promise<ManagedLaunchResult> {
  let sandbox = await miladySandboxService.getAgent(params.agentId, params.organizationId);
  if (!sandbox) {
    throw new ManagedMiladyLaunchError("Agent not found", 404);
  }

  const managedEnvironment = await prepareManagedMiladyEnvironment({
    existingEnv: sandbox.environment_vars,
    organizationId: params.organizationId,
    userId: params.userId,
  });

  if (managedEnvironment.changed) {
    await miladySandboxesRepository.update(sandbox.id, {
      environment_vars: managedEnvironment.environmentVars,
    });
    sandbox = {
      ...sandbox,
      environment_vars: managedEnvironment.environmentVars,
    };

    if (sandbox.status === "running") {
      const shutdownResult = await miladySandboxService.shutdown(sandbox.id, params.organizationId);
      if (!shutdownResult.success) {
        throw new ManagedMiladyLaunchError(
          shutdownResult.error || "Failed to refresh sandbox environment",
          shutdownResult.error === "Agent not found" ? 404 : 409,
        );
      }
      sandbox = (await miladySandboxService.getAgent(sandbox.id, params.organizationId)) ?? sandbox;
    }
  }

  if (sandbox.status !== "running" || !sandbox.health_url) {
    const provisionResult = await miladySandboxService.provision(sandbox.id, params.organizationId);

    if (!provisionResult.success) {
      throw new ManagedMiladyLaunchError(
        provisionResult.error || "Provisioning failed",
        provisionResult.error === "Agent not found" ? 404 : 500,
      );
    }

    if (!provisionResult.sandboxRecord) {
      throw new ManagedMiladyLaunchError("Provisioning failed", 500);
    }

    sandbox = provisionResult.sandboxRecord;
  }

  const apiBase = resolveManagedAgentApiBase(sandbox);
  if (!apiBase) {
    throw new ManagedMiladyLaunchError(
      "Managed launch is unavailable because no agent web endpoint is configured",
      503,
    );
  }

  await ensureManagedOnboarding(
    sandbox,
    apiBase,
    managedEnvironment.apiToken,
    managedEnvironment.userApiKey,
  );

  const connection: ManagedLaunchConnection = {
    apiBase,
    token: managedEnvironment.apiToken,
  };
  const payload: ManagedLaunchSessionPayload = {
    agentId: sandbox.id,
    agentName: sandbox.agent_name ?? "Milady",
    connection,
    issuedAt: new Date().toISOString(),
  };

  const appUrl = new URL(resolveMiladyAppUrl());
  let launchSessionId: string | null = null;

  if (cache.isAvailable()) {
    try {
      launchSessionId = crypto.randomUUID();
      await cache.set(
        resolveLaunchSessionCacheKey(launchSessionId),
        payload,
        LAUNCH_SESSION_TTL_SECONDS,
      );
      appUrl.searchParams.set("cloudLaunchSession", launchSessionId);
      appUrl.searchParams.set("cloudLaunchBase", resolveCloudPublicUrl());
    } catch (error) {
      launchSessionId = null;
      logger.warn(
        "[milady-managed-launch] Failed to persist launch session; falling back to direct launch params",
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  if (!launchSessionId) {
    if (!cache.isAvailable()) {
      logger.warn(
        "[milady-managed-launch] Cache unavailable; falling back to direct launch params",
      );
    }
    appUrl.searchParams.set("apiBase", connection.apiBase);
    appUrl.searchParams.set("token", connection.token);
  }

  return {
    ...payload,
    appUrl: appUrl.toString(),
    launchSessionId,
  };
}

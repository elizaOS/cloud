import type { Redis } from "@upstash/redis";
import { readFileSync } from "fs";
import { getHashTargets, refreshHashRing } from "./hash-router";
import { logger } from "./logger";

const KEDA_COOLDOWN_SECONDS = Number(process.env.KEDA_COOLDOWN_SECONDS ?? 900);
const FORWARD_TIMEOUT_MS = 30_000;
const RETRY_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS = 2_000;
const RETRY_INCREMENT_MS = 1_000;
const IDENTITY_CACHE_TTL_SECONDS = 300;
const IDENTITY_NEGATIVE_CACHE_TTL_SECONDS = 30;

interface ServerRoute {
  serverName: string;
  serverUrl: string;
}

export interface ResolvedIdentity {
  userId: string;
  organizationId: string;
  agentId: string;
}

export async function resolveIdentity(
  redis: Redis,
  cloudBaseUrl: string,
  authHeader: Record<string, string>,
  platform: string,
  platformId: string,
  platformName?: string,
): Promise<ResolvedIdentity | null> {
  const cacheKey = `identity:${platform}:${platformId}`;
  const cached = await redis.get<ResolvedIdentity | { notFound: true }>(cacheKey);
  if (cached) {
    if ("notFound" in cached) return null;
    return cached;
  }

  let url = `${cloudBaseUrl}/api/internal/identity/resolve?platform=${encodeURIComponent(platform)}&platformId=${encodeURIComponent(platformId)}`;
  if (platformName) url += `&platformName=${encodeURIComponent(platformName)}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FORWARD_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: authHeader,
      signal: controller.signal,
    });
    if (res.status === 404) {
      await redis.set(cacheKey, JSON.stringify({ notFound: true }), {
        ex: IDENTITY_NEGATIVE_CACHE_TTL_SECONDS,
      });
      return null;
    }
    if (!res.ok) throw new Error(`Identity resolve failed: ${res.status}`);

    const data = (await res.json()) as {
      userId: string;
      organizationId: string;
      agentId: string;
    };
    const identity: ResolvedIdentity = {
      userId: data.userId,
      organizationId: data.organizationId,
      agentId: data.agentId,
    };
    await redis.set(cacheKey, JSON.stringify(identity), {
      ex: IDENTITY_CACHE_TTL_SECONDS,
    });
    return identity;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function resolveAgentServer(
  redis: Redis,
  agentId: string,
): Promise<ServerRoute | null> {
  const serverName = await redis.get<string>(`agent:${agentId}:server`);
  if (!serverName) return null;

  const serverUrl = await redis.get<string>(`server:${serverName}:url`);
  if (!serverUrl) return null;

  return { serverName, serverUrl };
}

export async function refreshKedaActivity(redis: Redis, serverName: string): Promise<void> {
  const key = `keda:${serverName}:activity`;
  await redis.lpush(key, Date.now().toString());
  await redis.ltrim(key, 0, 0);
  await redis.expire(key, KEDA_COOLDOWN_SECONDS);
}

let k8sToken: string | null = null;
let k8sCaCert: string | null = null;

function getK8sToken(): string | null {
  if (k8sToken !== null) return k8sToken;
  try {
    k8sToken = readFileSync("/var/run/secrets/kubernetes.io/serviceaccount/token", "utf-8").trim();
  } catch (err) {
    logger.debug("K8s service account token not available", {
      error: err instanceof Error ? err.message : String(err),
    });
    k8sToken = "";
  }
  return k8sToken || null;
}

function getK8sCaCert(): string | null {
  if (k8sCaCert !== null) return k8sCaCert;
  try {
    k8sCaCert = readFileSync("/var/run/secrets/kubernetes.io/serviceaccount/ca.crt", "utf-8");
  } catch (err) {
    logger.debug("K8s CA cert not available", {
      error: err instanceof Error ? err.message : String(err),
    });
    k8sCaCert = "";
  }
  return k8sCaCert || null;
}

function parseNamespaceFromUrl(serverUrl: string): string | null {
  const match = serverUrl.match(/^https?:\/\/[^.]+\.([^.]+)\.svc/);
  return match?.[1] ?? null;
}

export async function wakeServer(serverName: string, serverUrl: string): Promise<void> {
  const token = getK8sToken();
  if (!token) return;

  const namespace = parseNamespaceFromUrl(serverUrl);
  if (!namespace) return;

  const apiUrl = `https://kubernetes.default.svc/apis/apps/v1/namespaces/${namespace}/deployments/${serverName}/scale`;

  try {
    const res = await fetch(apiUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/strategic-merge-patch+json",
      },
      body: JSON.stringify({ spec: { replicas: 1 } }),
      tls: { ca: getK8sCaCert() ?? undefined },
    } as RequestInit);
    if (!res.ok) {
      const text = await res.text();
      logger.error("wakeServer failed", {
        serverName,
        status: res.status,
        body: text,
      });
    }
  } catch (err) {
    logger.error("wakeServer error", {
      serverName,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function forwardToServer(
  serverUrl: string,
  serverName: string,
  agentId: string,
  userId: string,
  text: string,
): Promise<string> {
  const body = JSON.stringify({ userId, text });

  let lastError: Error | null = null;
  let woken = false;

  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_BASE_DELAY_MS + RETRY_INCREMENT_MS * attempt;
      await new Promise((r) => setTimeout(r, delay));
    }

    const targets = await getHashTargets(serverUrl, userId, 2);

    if (targets.length === 0) {
      if (!woken) {
        woken = true;
        wakeServer(serverName, serverUrl).catch(() => {});
      }
      lastError = new Error("No pods available (scaled to zero)");
      continue;
    }

    const result = await tryTarget(targets[0], agentId, body);
    if (result.ok) return result.response;

    if (targets.length > 1) {
      await refreshHashRing(serverUrl);
      const fallback = await tryTarget(targets[1], agentId, body);
      if (fallback.ok) return fallback.response;
    }

    lastError = result.error;
    if (!woken && result.isConnectionError) {
      woken = true;
      wakeServer(serverName, serverUrl).catch(() => {});
    }
  }

  throw lastError ?? new Error("forwardToServer failed");
}

type TargetResult =
  | { ok: true; response: string }
  | { ok: false; error: Error; isConnectionError: boolean };

async function tryTarget(target: string, agentId: string, body: string): Promise<TargetResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FORWARD_TIMEOUT_MS);

  try {
    const res = await fetch(`http://${target}/agents/${agentId}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: controller.signal,
    });

    if (res.ok) {
      const data = (await res.json()) as { response: string };
      return { ok: true, response: data.response };
    }

    return {
      ok: false,
      error: new Error(`Server returned ${res.status}: ${await res.text()}`),
      isConnectionError: false,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err : new Error(String(err)),
      isConnectionError: true,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

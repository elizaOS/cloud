import type { Redis } from "@upstash/redis";

const KEDA_COOLDOWN_SECONDS = 900;
const FORWARD_TIMEOUT_MS = 30_000;
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2_000;

interface ServerRoute {
  serverName: string;
  serverUrl: string;
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

// See 04-crd-operator.md § KEDA ScaledObjects
export async function refreshKedaActivity(
  redis: Redis,
  serverName: string,
): Promise<void> {
  const key = `keda:${serverName}:activity`;
  await redis.lpush(key, Date.now().toString());
  await redis.ltrim(key, 0, 0);
  await redis.expire(key, KEDA_COOLDOWN_SECONDS);
}

/**
 * Retries on failure to handle KEDA cold starts (0→1 scaling).
 */
export async function forwardToServer(
  serverUrl: string,
  agentId: string,
  userId: string,
  text: string,
): Promise<string> {
  const url = `${serverUrl}/agents/${agentId}/message`;
  const body = JSON.stringify({ userId, text });

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FORWARD_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: controller.signal,
      });

      if (res.ok) {
        const data = (await res.json()) as { response: string };
        return data.response;
      }

      lastError = new Error(
        `Server returned ${res.status}: ${await res.text()}`,
      );
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError ?? new Error("forwardToServer failed");
}

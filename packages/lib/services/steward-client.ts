/**
 * Steward integration for Eliza Cloud.
 *
 * Two layers:
 *   1. `getStewardClient()` — returns a `@stwd/sdk` StewardClient for
 *      provisioning and signing (used by server-wallets.ts).
 *   2. Read-only helpers (`getStewardAgent`, `getStewardWalletInfo`) that
 *      hit the Steward REST API directly for the API/dashboard layer.
 *      These use lightweight fetch calls so we don't depend on the SDK for
 *      simple reads that only need a subset of the response.
 */

import { StewardClient } from "@stwd/sdk";
import { logger } from "@/lib/utils/logger";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const STEWARD_HOST_URL = process.env.STEWARD_API_URL || "http://localhost:3200";
const STEWARD_TENANT_API_KEY = process.env.STEWARD_TENANT_API_KEY || "";
const STEWARD_TENANT_ID = process.env.STEWARD_TENANT_ID || "milady-cloud";

// ---------------------------------------------------------------------------
// SDK client (singleton)
// ---------------------------------------------------------------------------

let _client: StewardClient | null = null;

/**
 * Returns a configured `@stwd/sdk` StewardClient instance (singleton).
 *
 * Used by `server-wallets.ts` for wallet provisioning and RPC execution.
 */
export function getStewardClient(): StewardClient {
  if (!_client) {
    _client = new StewardClient({
      baseUrl: STEWARD_HOST_URL,
      apiKey: STEWARD_TENANT_API_KEY || undefined,
      tenantId: STEWARD_TENANT_ID || undefined,
    });
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Types (for read-only API layer)
// ---------------------------------------------------------------------------

export interface StewardAgentInfo {
  id: string;
  name: string;
  walletAddress: string | null;
  createdAt: string;
}

export interface StewardWalletInfo {
  agentId: string;
  walletAddress: string | null;
  walletProvider: "steward";
  walletStatus: "active" | "pending" | "error" | "unknown";
  balance?: string | null;
  chain?: string | null;
}

// ---------------------------------------------------------------------------
// Lightweight fetch helpers (for API routes that only need reads)
// ---------------------------------------------------------------------------

function stewardHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (STEWARD_TENANT_ID) {
    headers["X-Steward-Tenant"] = STEWARD_TENANT_ID;
  }
  if (STEWARD_TENANT_API_KEY) {
    headers["X-Steward-Key"] = STEWARD_TENANT_API_KEY;
  }
  return headers;
}

async function stewardFetch<T>(path: string, options?: RequestInit): Promise<T | null> {
  const url = `${STEWARD_HOST_URL}${path}`;
  try {
    const response = await fetch(url, {
      ...options,
      headers: { ...stewardHeaders(), ...(options?.headers ?? {}) },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      logger.warn(`[steward-client] ${path} returned ${response.status}`);
      return null;
    }

    return (await response.json()) as T;
  } catch (err) {
    logger.warn(
      `[steward-client] Failed to reach Steward at ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Read-only public API (used by API routes + dashboard)
// ---------------------------------------------------------------------------

/**
 * Fetch agent info from Steward, including wallet address.
 */
export async function getStewardAgent(agentId: string): Promise<StewardAgentInfo | null> {
  const data = await stewardFetch<{
    id?: string;
    name?: string;
    walletAddress?: string;
    wallet_address?: string;
    created_at?: string;
    createdAt?: string;
  }>(`/agents/${encodeURIComponent(agentId)}`);

  if (!data) return null;

  return {
    id: data.id ?? agentId,
    name: data.name ?? "",
    walletAddress: data.walletAddress ?? data.wallet_address ?? null,
    createdAt: data.createdAt ?? data.created_at ?? "",
  };
}

/**
 * Fetch wallet info for a sandbox/agent from Steward.
 * Returns a normalized StewardWalletInfo or null if unreachable.
 */
export async function getStewardWalletInfo(agentId: string): Promise<StewardWalletInfo | null> {
  // Use the SDK client for balance, since it handles auth + parsing
  const client = getStewardClient();

  let agent: StewardAgentInfo | null = null;
  try {
    const sdkAgent = await client.getAgent(agentId);
    agent = {
      id: sdkAgent.id,
      name: sdkAgent.name,
      walletAddress: sdkAgent.walletAddress || null,
      createdAt: sdkAgent.createdAt?.toISOString?.() ?? "",
    };
  } catch {
    // SDK call failed, try lightweight fetch as fallback
    agent = await getStewardAgent(agentId);
  }

  if (!agent) return null;

  let balance: string | null = null;
  let chain: string | null = null;

  if (agent.walletAddress) {
    try {
      const balanceResult = await client.getBalance(agentId);
      balance = balanceResult.balances?.nativeFormatted ?? null;
      chain = balanceResult.balances?.chainId
        ? `eip155:${balanceResult.balances.chainId}`
        : null;
    } catch {
      // Balance fetch is best-effort
    }
  }

  return {
    agentId,
    walletAddress: agent.walletAddress,
    walletProvider: "steward",
    walletStatus: agent.walletAddress ? "active" : "pending",
    balance,
    chain,
  };
}

/**
 * Check if Steward is reachable.
 */
export async function isStewardAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${STEWARD_HOST_URL}/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

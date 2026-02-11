import { NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import type { ServiceConfig, ServiceHandler } from "../types";
import { getServiceMethodCost } from "../pricing";
import { PROXY_CONFIG } from "../config";
import { servicePricingRepository } from "@/db/repositories";
import { cache } from "@/lib/cache/client";

// Methods that should not be cached (mutations and rapidly changing data)
const NON_CACHEABLE_METHODS = new Set([
  "sendTransaction",
  "simulateTransaction",
  "requestAirdrop",
  "getRecentBlockhash",
  "getLatestBlockhash",
]);

/**
 * Hardcoded Fallback Whitelist
 * 
 * MAINTENANCE NOTE: This is now a FALLBACK ONLY.
 * 
 * Primary method authorization comes from the database (service_pricing table).
 * Any method with an active pricing entry (is_active=true) is automatically allowed.
 * 
 * This hardcoded list serves as:
 * 1. Emergency fallback if database is unreachable
 * 2. Bootstrap/seed data reference
 * 3. Documentation of supported methods
 * 
 * To add new methods:
 * ✅ Add pricing entry via admin API: POST /api/v1/admin/service-pricing
 * ❌ DO NOT edit this list (unless updating fallback)
 * 
 * @see getActiveMethodsFromDatabase() for the primary authorization logic
 */
const HARDCODED_FALLBACK_METHODS = new Set([
  // Tier 1 - Standard Solana RPC (fall under _default pricing)
  "getAccountInfo",
  "getBalance",
  "getBlockHeight",
  "getBlockProduction",
  "getBlockCommitment",
  "getClusterNodes",
  "getEpochInfo",
  "getEpochSchedule",
  "getFeeForMessage",
  "getFirstAvailableBlock",
  "getGenesisHash",
  "getHealth",
  "getHighestSnapshotSlot",
  "getIdentity",
  "getInflationGovernor",
  "getInflationRate",
  "getLargestAccounts",
  "getLatestBlockhash",
  "getLeaderSchedule",
  "getMaxRetransmitSlot",
  "getMaxShredInsertSlot",
  "getMinimumBalanceForRentExemption",
  "getMultipleAccounts",
  "getRecentBlockhash",
  "getRecentPerformanceSamples",
  "getRecentPrioritizationFees",
  "getSignatureStatuses",
  "getSlot",
  "getSlotLeader",
  "getSlotLeaders",
  "getStakeActivation",
  "getStakeMinimumDelegation",
  "getSupply",
  "getTokenAccountBalance",
  "getTokenAccountsByDelegate",
  "getTokenAccountsByOwner",
  "getTokenLargestAccounts",
  "getTokenSupply",
  "getTransactionCount",
  "getVersion",
  "getVoteAccounts",
  "isBlockhashValid",
  "minimumLedgerSlot",
  "requestAirdrop",
  "sendTransaction",
  "simulateTransaction",
  
  // Tier 2 - DAS API (explicitly priced)
  "getAsset",
  "getAssetsByOwner",
  "searchAssets",
  "getTokenAccounts",
  "getAssetProof",
  "getAssetProofBatch",
  "getAssetsByAuthority",
  "getAssetsByCreator",
  "getAssetsByGroup",
  "getAssetBatch",
  "getSignaturesForAsset",
  "getNftEditions",
  
  // Tier 2 - Complex/Historical (explicitly priced)
  "getProgramAccounts",
  "getBlock",
  "getBlocks",
  "getBlocksWithLimit",
  "getTransaction",
  "getSignaturesForAddress",
  "getBlockTime",
  "getInflationReward",
  
  // Tier 3 - Enhanced/ZK (explicitly priced)
  "getTransactionsForAddress",
  "getValidityProof",
]);

/**
 * Cache key for allowed methods list
 * TTL: 60 seconds (fast refresh for new methods added via admin API)
 */
const ALLOWED_METHODS_CACHE_KEY = "solana-rpc:allowed-methods";
const ALLOWED_METHODS_CACHE_TTL = 60;

/**
 * Gets allowed methods from database (with caching)
 * 
 * Strategy:
 * 1. Check cache (60s TTL) - fast path for most requests
 * 2. Query database for active methods
 * 3. Fallback to hardcoded list if DB fails
 * 
 * Performance:
 * - Cache hit: ~1ms (no DB query)
 * - Cache miss: ~10-50ms (DB query)
 * - DB failure: Falls back to hardcoded list immediately
 * 
 * @returns Set of allowed method names
 */
async function getAllowedMethods(): Promise<Set<string>> {
  try {
    // Check cache first
    const cached = await cache.get<string[]>(ALLOWED_METHODS_CACHE_KEY);
    if (cached) {
      logger.debug("[Solana RPC] Allowed methods cache hit");
      return new Set(cached);
    }

    logger.debug("[Solana RPC] Allowed methods cache miss, querying database");

    // Query database for active methods
    const pricingRecords = await servicePricingRepository.listByService("solana-rpc");
    const activeMethods = pricingRecords
      .filter((record) => record.is_active)
      .map((record) => record.method);

    if (activeMethods.length === 0) {
      logger.warn("[Solana RPC] No active methods in database, using fallback");
      return HARDCODED_FALLBACK_METHODS;
    }

    // Cache the result
    await cache.set(
      ALLOWED_METHODS_CACHE_KEY,
      activeMethods,
      ALLOWED_METHODS_CACHE_TTL
    );

    logger.info("[Solana RPC] Loaded allowed methods from database", {
      count: activeMethods.length,
      cached_for: `${ALLOWED_METHODS_CACHE_TTL}s`,
    });

    return new Set(activeMethods);
  } catch (error) {
    // Database or cache failure - use hardcoded fallback
    logger.error("[Solana RPC] Failed to load allowed methods from database, using fallback", {
      error: error instanceof Error ? error.message : "Unknown error",
      fallback_count: HARDCODED_FALLBACK_METHODS.size,
    });
    
    return HARDCODED_FALLBACK_METHODS;
  }
}

/**
 * Checks if a method is allowed
 * 
 * Uses database-driven whitelist with hardcoded fallback.
 * Results are cached for 60 seconds to minimize DB load.
 * 
 * @param method - RPC method name to check
 * @returns true if method is allowed
 */
async function isMethodAllowed(method: string): Promise<boolean> {
  const allowedMethods = await getAllowedMethods();
  return allowedMethods.has(method);
}

async function extractMethodFromBody(body: unknown): Promise<string> {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid JSON-RPC request: body must be an object");
  }

  if (Array.isArray(body)) {
    if (body.length === 0) {
      throw new Error("Invalid JSON-RPC batch: empty array");
    }
    if (body.length > PROXY_CONFIG.MAX_BATCH_SIZE) {
      throw new Error(`Invalid JSON-RPC batch: maximum ${PROXY_CONFIG.MAX_BATCH_SIZE} requests`);
    }
    return "_batch";
  }

  if (!("method" in body) || typeof body.method !== "string") {
    throw new Error("Invalid JSON-RPC request: missing method field");
  }

  const method = body.method;
  
  // Validate method is in database-driven whitelist (with caching)
  const allowed = await isMethodAllowed(method);
  if (!allowed) {
    throw new Error(
      `Method '${method}' is not supported. See /api/v1/solana/methods for allowed methods.`
    );
  }

  return method;
}

async function calculateBatchCost(body: unknown[]): Promise<number> {
  const methods: string[] = [];
  
  // Get allowed methods once for the entire batch (cached)
  const allowedMethods = await getAllowedMethods();
  
  for (const item of body) {
    if (!item || typeof item !== "object" || !("method" in item)) {
      throw new Error("Invalid JSON-RPC batch: malformed request");
    }
    const method = String(item.method);
    
    // Validate each method in batch against database whitelist
    if (!allowedMethods.has(method)) {
      throw new Error(
        `Batch contains unsupported method '${method}'. See /api/v1/solana/methods for allowed methods.`
      );
    }
    
    methods.push(method);
  }
  
  // Fetch costs for unique methods in parallel
  const uniqueMethods = [...new Set(methods)];
  const costMap = new Map<string, number>();
  
  await Promise.all(
    uniqueMethods.map(async (method) => {
      const cost = await getServiceMethodCost("solana-rpc", method);
      costMap.set(method, cost);
    })
  );
  
  // Sum costs for all requests
  return methods.reduce((total, method) => total + (costMap.get(method) ?? 0), 0);
}

export const solanaRpcConfig: ServiceConfig = {
  id: "solana-rpc",
  name: "Solana RPC",
  auth: "apiKeyWithOrg",
  rateLimit: {
    windowMs: 60000,
    maxRequests: 100,
  },
  cache: {
    maxTTL: 60,
    isMethodCacheable: (method) => !NON_CACHEABLE_METHODS.has(method),
    maxResponseSize: 65536,
    hitCostMultiplier: 0.5,
  },
  getCost: async (body: unknown) => {
    const method = extractMethodFromBody(body);

    if (method === "_batch" && Array.isArray(body)) {
      return await calculateBatchCost(body);
    }

    return await getServiceMethodCost("solana-rpc", method);
  },
};

/**
 * Retry wrapper with exponential backoff
 * Delays: 1s, 2s, 4s, 8s, 16s (max)
 */
async function fetchWithRetry(
  url: string,
  body: unknown,
  network: string,
  attempt: number = 1,
): Promise<Response> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(PROXY_CONFIG.UPSTREAM_TIMEOUT_MS),
    });

    // Log attempt
    const sanitizedUrl = url.replace(/api-key=[^&]+/, "api-key=***");
    logger.debug("[Solana RPC] Attempt", {
      attempt,
      url: sanitizedUrl,
      status: response.status,
    });

    // Success or non-retriable error
    if (response.ok || response.status === 400 || response.status === 404) {
      return response;
    }

    // Retriable error - retry if attempts remain
    if (attempt < PROXY_CONFIG.RPC_MAX_RETRIES) {
      const delayMs = PROXY_CONFIG.RPC_INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      logger.warn("[Solana RPC] Retriable error, retrying", {
        attempt,
        status: response.status,
        delayMs,
      });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return fetchWithRetry(url, body, network, attempt + 1);
    }

    return response;
  } catch (error) {
    const sanitizedUrl = url.replace(/api-key=[^&]+/, "api-key=***");
    
    if (error instanceof Error && error.name === "TimeoutError") {
      logger.warn("[Solana RPC] Timeout", { attempt, url: sanitizedUrl });
      
      // Retry on timeout if attempts remain
      if (attempt < PROXY_CONFIG.RPC_MAX_RETRIES) {
        const delayMs = PROXY_CONFIG.RPC_INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        logger.info("[Solana RPC] Retrying after timeout", { attempt, delayMs });
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return fetchWithRetry(url, body, network, attempt + 1);
      }
    }

    throw error;
  }
}

export const solanaRpcHandler: ServiceHandler = async ({
  body,
  searchParams,
}) => {
  const network = searchParams.get("network") || "mainnet";

  if (network !== "mainnet" && network !== "devnet") {
    throw new Error("Invalid network: must be mainnet or devnet");
  }

  const apiKey = process.env.SOLANA_RPC_PROVIDER_API_KEY;
  if (!apiKey) {
    throw new Error("SOLANA_RPC_PROVIDER_API_KEY not configured");
  }

  // Build primary and fallback URLs
  const primaryBaseUrl = network === "mainnet" 
    ? PROXY_CONFIG.HELIUS_MAINNET_URL 
    : PROXY_CONFIG.HELIUS_DEVNET_URL;
  
  const fallbackBaseUrl = network === "mainnet"
    ? PROXY_CONFIG.HELIUS_MAINNET_FALLBACK_URL
    : PROXY_CONFIG.HELIUS_DEVNET_FALLBACK_URL;
  
  // Note: Helius requires API key in URL. Alternative patterns checked:
  // - Authorization header: Not supported by Helius RPC
  // - x-api-key header: Not supported by Helius RPC
  // Security: URL is never logged due to sanitization below
  const primaryUrl = `${primaryBaseUrl}/?api-key=${apiKey}`;

  try {
    // Try primary URL with retry-backoff
    const response = await fetchWithRetry(primaryUrl, body, network);

    if (!response.ok) {
      const errorBody = await response.text();
      const sanitizedUrl = primaryUrl.replace(/api-key=[^&]+/, "api-key=***");
      logger.error("[Solana RPC] Primary URL failed", {
        url: sanitizedUrl,
        status: response.status,
        body: errorBody,
      });

      // Try fallback if configured
      if (fallbackBaseUrl) {
        logger.info("[Solana RPC] Attempting fallback URL");
        const fallbackUrl = `${fallbackBaseUrl}/?api-key=${apiKey}`;
        
        try {
          const fallbackResponse = await fetchWithRetry(fallbackUrl, body, network);
          
          if (fallbackResponse.ok) {
            logger.info("[Solana RPC] Fallback succeeded");
            return { response: fallbackResponse };
          }
          
          const fallbackError = await fallbackResponse.text();
          const sanitizedFallback = fallbackUrl.replace(/api-key=[^&]+/, "api-key=***");
          logger.error("[Solana RPC] Fallback also failed", {
            url: sanitizedFallback,
            status: fallbackResponse.status,
            body: fallbackError,
          });
        } catch (fallbackErr) {
          logger.error("[Solana RPC] Fallback error", {
            error: fallbackErr instanceof Error ? fallbackErr.message : "Unknown",
          });
        }
      }

      return {
        response: NextResponse.json(
          {
            error: "Upstream RPC error",
            code: response.status,
          },
          { status: 502 },
        ),
      };
    }

    return { response };
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      const sanitizedUrl = primaryUrl.replace(/api-key=[^&]+/, "api-key=***");
      logger.error("[Solana RPC] All attempts timed out", { url: sanitizedUrl });
      throw new Error("timeout");
    }
    throw error;
  }
};

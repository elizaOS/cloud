import { NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import type { ServiceConfig, ServiceHandler } from "../types";
import { getServiceMethodCost, calculateBatchCost } from "../pricing";
import { PROXY_CONFIG } from "../config";
import { retryFetch } from "../fetch";

// Methods that should not be cached (mutations and rapidly changing data)
export const SOLANA_NON_CACHEABLE_METHODS = new Set([
  "sendTransaction",
  "simulateTransaction",
  "requestAirdrop",
  "getRecentBlockhash",
  "getLatestBlockhash",
]);

// Whitelist of allowed Solana RPC methods
// Based on official Solana RPC API + Helius extensions (DAS, Enhanced)
export const SOLANA_ALLOWED_METHODS = new Set([
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

function extractMethodFromBody(body: unknown): string {
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
  
  // Validate method is in whitelist
  if (!SOLANA_ALLOWED_METHODS.has(method)) {
    throw new Error(
      `Method '${method}' is not supported. See /api/v1/solana/methods for allowed methods.`
    );
  }

  return method;
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
    isMethodCacheable: (method) => !SOLANA_NON_CACHEABLE_METHODS.has(method),
    maxResponseSize: 65536,
    hitCostMultiplier: 0.5,
  },
  getCost: async (body: unknown) => {
    const method = extractMethodFromBody(body);

    if (method === "_batch" && Array.isArray(body)) {
      return calculateBatchCost("solana-rpc", SOLANA_ALLOWED_METHODS, body, PROXY_CONFIG.MAX_BATCH_SIZE);
    }

    return getServiceMethodCost("solana-rpc", method);
  },
};


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
    const response = await retryFetch({
      url: primaryUrl,
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
      maxRetries: PROXY_CONFIG.RPC_MAX_RETRIES,
      initialDelayMs: PROXY_CONFIG.RPC_INITIAL_RETRY_DELAY_MS,
      timeoutMs: PROXY_CONFIG.UPSTREAM_TIMEOUT_MS,
      serviceTag: "Solana RPC",
      nonRetriableStatuses: [400, 404],
    });

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
          const fallbackResponse = await retryFetch({
            url: fallbackUrl,
            init: {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(body),
            },
            maxRetries: PROXY_CONFIG.RPC_MAX_RETRIES,
            initialDelayMs: PROXY_CONFIG.RPC_INITIAL_RETRY_DELAY_MS,
            timeoutMs: PROXY_CONFIG.UPSTREAM_TIMEOUT_MS,
            serviceTag: "Solana RPC",
            nonRetriableStatuses: [400, 404],
          });
          
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

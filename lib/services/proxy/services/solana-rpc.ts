import { NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import type { ServiceConfig, ServiceHandler } from "../types";
import { getServiceMethodCost } from "../pricing";
import { PROXY_CONFIG } from "../config";

// Methods that should not be cached (mutations and rapidly changing data)
const NON_CACHEABLE_METHODS = new Set([
  "sendTransaction",
  "simulateTransaction",
  "requestAirdrop",
  "getRecentBlockhash",
  "getLatestBlockhash",
]);

// Whitelist of allowed Solana RPC methods
// Based on official Solana RPC API + Helius extensions (DAS, Enhanced)
const ALLOWED_METHODS = new Set([
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
  if (!ALLOWED_METHODS.has(method)) {
    throw new Error(
      `Method '${method}' is not supported. See /api/v1/solana/methods for allowed methods.`
    );
  }

  return method;
}

async function calculateBatchCost(body: unknown[]): Promise<number> {
  const methods: string[] = [];
  
  for (const item of body) {
    if (!item || typeof item !== "object" || !("method" in item)) {
      throw new Error("Invalid JSON-RPC batch: malformed request");
    }
    const method = String(item.method);
    
    // Validate each method in batch
    if (!ALLOWED_METHODS.has(method)) {
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

  // Build provider URL based on network
  const baseUrl = network === "mainnet" 
    ? PROXY_CONFIG.HELIUS_MAINNET_URL 
    : PROXY_CONFIG.HELIUS_DEVNET_URL;
  
  // Note: Helius requires API key in URL. Alternative patterns checked:
  // - Authorization header: Not supported by Helius RPC
  // - x-api-key header: Not supported by Helius RPC
  // Security: URL is never logged due to sanitization below
  const url = `${baseUrl}/?api-key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(PROXY_CONFIG.UPSTREAM_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      // Sanitize URL before logging (remove API key)
      const sanitizedUrl = `https://${network}.helius-rpc.com/?api-key=***`;
      logger.error("[Solana RPC] Upstream error", {
        url: sanitizedUrl,
        status: response.status,
        body: errorBody,
      });

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
      // Sanitize URL before logging
      const sanitizedUrl = `https://${network}.helius-rpc.com/?api-key=***`;
      logger.error("[Solana RPC] Upstream timeout", { url: sanitizedUrl });
      throw new Error("timeout");
    }
    throw error;
  }
};

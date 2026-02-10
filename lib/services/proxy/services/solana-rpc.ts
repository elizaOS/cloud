import { NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import type { ServiceConfig, ServiceHandler } from "../types";
import { getServiceMethodCost } from "../pricing";

const NON_CACHEABLE_METHODS = new Set([
  "sendTransaction",
  "simulateTransaction",
  "requestAirdrop",
  "getRecentBlockhash",
  "getLatestBlockhash",
]);

function extractMethodFromBody(body: unknown): string {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid JSON-RPC request: body must be an object");
  }

  if (Array.isArray(body)) {
    if (body.length === 0) {
      throw new Error("Invalid JSON-RPC batch: empty array");
    }
    if (body.length > 20) {
      throw new Error("Invalid JSON-RPC batch: maximum 20 requests");
    }
    return "_batch";
  }

  if (!("method" in body) || typeof body.method !== "string") {
    throw new Error("Invalid JSON-RPC request: missing method field");
  }

  return body.method;
}

async function calculateBatchCost(body: unknown[]): Promise<number> {
  let totalCost = 0;
  for (const item of body) {
    if (!item || typeof item !== "object" || !("method" in item)) {
      throw new Error("Invalid JSON-RPC batch: malformed request");
    }
    const method = String(item.method);
    const cost = await getServiceMethodCost("solana-rpc", method);
    totalCost += cost;
  }
  return totalCost;
}

export const solanaRpcConfig: ServiceConfig = {
  id: "solana-rpc",
  name: "Solana RPC",
  auth: "apiKeyWithOrg",
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

  const url = `https://${network}.helius-rpc.com/?api-key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error("[Solana RPC] Upstream error", {
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
      logger.error("[Solana RPC] Upstream timeout");
      throw new Error("timeout");
    }
    throw error;
  }
};

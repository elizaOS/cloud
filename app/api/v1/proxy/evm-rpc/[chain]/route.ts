/**
 * EVM RPC Proxy
 *
 * Proxies JSON-RPC requests to an Alchemy-backed EVM RPC endpoint.
 * The cloud injects its own Alchemy API key server-side and routes
 * to the correct Alchemy network based on the chain parameter.
 *
 * Usage: POST /api/v1/proxy/evm-rpc/mainnet
 *        POST /api/v1/proxy/evm-rpc/base
 *        Body: JSON-RPC 2.0 request (or batch)
 */

import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { creditsService } from "@/lib/services/credits";
import { withRateLimit } from "@/lib/middleware/rate-limit";
import { proxyBillingService } from "@/lib/services/proxy-billing";
import { logger } from "@/lib/utils/logger";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
const MAX_BATCH_SIZE = 100;
const EVM_RPC_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: process.env.NODE_ENV !== "production" ? 10_000 : 100,
} as const;

/**
 * Alchemy network slugs for each chain name.
 * NOTE: Keep in sync with plugins/plugin-evm/typescript/rpc-providers.ts ALCHEMY_CHAIN_MAP.
 */
const ALCHEMY_CHAIN_MAP: Record<string, string> = {
  mainnet: "eth-mainnet",
  sepolia: "eth-sepolia",
  holesky: "eth-holesky",
  polygon: "polygon-mainnet",
  polygonAmoy: "polygon-amoy",
  arbitrum: "arb-mainnet",
  arbitrumSepolia: "arb-sepolia",
  optimism: "opt-mainnet",
  optimismSepolia: "opt-sepolia",
  base: "base-mainnet",
  baseSepolia: "base-sepolia",
  zksync: "zksync-mainnet",
  linea: "linea-mainnet",
  lineaSepolia: "linea-sepolia",
  scroll: "scroll-mainnet",
  blast: "blast-mainnet",
  avalanche: "avax-mainnet",
  bsc: "bnb-mainnet",
  celo: "celo-mainnet",
  gnosis: "gnosis-mainnet",
};

async function postHandler(
  request: NextRequest,
  { params }: { params: Promise<{ chain: string }> },
) {
  const { chain } = await params;

  const authResult = await requireAuthOrApiKeyWithOrg(request);
  const { organization_id } = authResult.user;

  const alchemySlug = ALCHEMY_CHAIN_MAP[chain];
  if (!alchemySlug) {
    return Response.json(
      {
        error: `Unsupported chain: ${chain}. Supported: ${Object.keys(ALCHEMY_CHAIN_MAP).join(", ")}`,
      },
      { status: 400 },
    );
  }

  const alchemyApiKey = process.env.ALCHEMY_API_KEY;
  if (!alchemyApiKey) {
    logger.error("ALCHEMY_API_KEY not configured on cloud server");
    return Response.json(
      { error: "EVM RPC proxy not available — server misconfigured" },
      { status: 503 },
    );
  }

  const rpcUrl = `https://${alchemySlug}.g.alchemy.com/v2/${alchemyApiKey}`;
  const body = await request.text();

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(body);
  } catch {
    return Response.json(
      { error: "Invalid JSON-RPC body" },
      { status: 400 },
    );
  }

  let requestCount = 1;
  if (Array.isArray(parsedBody)) {
    if (parsedBody.length === 0) {
      return Response.json(
        { error: "JSON-RPC batch requests must include at least one item" },
        { status: 400 },
      );
    }

    if (parsedBody.length > MAX_BATCH_SIZE) {
      return Response.json(
        { error: `JSON-RPC batch limit exceeded (max ${MAX_BATCH_SIZE})` },
        { status: 400 },
      );
    }

    requestCount = parsedBody.length;
  }

  if (requestCount > 0) {
    const totalCost = proxyBillingService.getProxyCost("evm-rpc") * requestCount;
    const ok = await creditsService.deductCredits({
      organizationId: organization_id,
      amount: totalCost,
      description: `API proxy: evm-rpc — ${chain} (batch of ${requestCount})`,
      metadata: {
        type: "proxy_evm-rpc",
        service: "evm-rpc",
        path: chain,
        batchSize: requestCount,
      },
    }).catch(() => ({ success: false }));
    if (!ok.success) {
      return Response.json(
        { error: "Insufficient credits", topUpUrl: "https://www.elizacloud.ai/dashboard/billing" },
        { status: 402 },
      );
    }
  }

  const upstreamResponse = await fetch(rpcUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
  });

  const responseBody = await upstreamResponse.text();

  return new Response(responseBody, {
    status: upstreamResponse.status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export const POST = withRateLimit(postHandler, EVM_RPC_RATE_LIMIT);

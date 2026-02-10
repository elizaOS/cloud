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
import { proxyBillingService } from "@/lib/services/proxy-billing";
import { creditsService } from "@/lib/services/credits";
import { logger } from "@/lib/utils/logger";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

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

export async function POST(
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

  // Determine if batch request for billing
  let requestCount = 1;
  try {
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed)) {
      requestCount = parsed.length;
    }
  } catch {
    // Single request or invalid JSON — upstream will handle
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

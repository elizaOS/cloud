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

import { Hono } from "hono";

import { creditsService } from "@/lib/services/credits";
import { proxyBillingService } from "@/lib/services/proxy-billing";
import { logger } from "@/lib/utils/logger";
import { requireUserOrApiKeyWithOrg } from "@/api-lib/auth";
import type { AppEnv } from "@/api-lib/context";
import { failureResponse } from "@/api-lib/errors";
import { rateLimit } from "@/api-lib/rate-limit";

const MAX_BATCH_SIZE = 100;

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

const app = new Hono<AppEnv>();

app.use("*", rateLimit({ windowMs: 60_000, maxRequests: 100 }));

app.post("/", async (c) => {
  try {
    const chain = c.req.param("chain");
    if (!chain) {
      return c.json({ error: "Missing chain parameter" }, 400);
    }

    // Support auth via query param for clients that cannot set headers.
    const queryApiKey = c.req.query("api_key");
    if (queryApiKey && !c.req.header("authorization") && !c.req.header("X-API-Key")) {
      c.req.raw.headers.set("authorization", `Bearer ${queryApiKey}`);
    }

    const user = await requireUserOrApiKeyWithOrg(c);
    const { organization_id } = user;

    const alchemySlug = ALCHEMY_CHAIN_MAP[chain];
    if (!alchemySlug) {
      return c.json(
        {
          error: `Unsupported chain: ${chain}. Supported: ${Object.keys(ALCHEMY_CHAIN_MAP).join(", ")}`,
        },
        400,
      );
    }

    const alchemyApiKey = c.env.ALCHEMY_API_KEY as string | undefined;
    if (!alchemyApiKey) {
      logger.error("ALCHEMY_API_KEY not configured on cloud server");
      return c.json(
        { error: "EVM RPC proxy not available — server misconfigured" },
        503,
      );
    }

    const rpcUrl = `https://${alchemySlug}.g.alchemy.com/v2/${alchemyApiKey}`;
    const body = await c.req.text();

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(body);
    } catch {
      return c.json({ error: "Invalid JSON-RPC body" }, 400);
    }

    let requestCount = 1;
    if (Array.isArray(parsedBody)) {
      if (parsedBody.length === 0) {
        return c.json(
          { error: "JSON-RPC batch requests must include at least one item" },
          400,
        );
      }

      if (parsedBody.length > MAX_BATCH_SIZE) {
        return c.json(
          { error: `JSON-RPC batch limit exceeded (max ${MAX_BATCH_SIZE})` },
          400,
        );
      }

      requestCount = parsedBody.length;
    }

    if (requestCount > 0) {
      const totalCost = proxyBillingService.getProxyCost("evm-rpc") * requestCount;
      const ok = await creditsService
        .deductCredits({
          organizationId: organization_id,
          amount: totalCost,
          description: `API proxy: evm-rpc — ${chain} (batch of ${requestCount})`,
          metadata: {
            type: "proxy_evm-rpc",
            service: "evm-rpc",
            path: chain,
            batchSize: requestCount,
          },
        })
        .catch(() => ({ success: false }));
      if (!ok.success) {
        return c.json(
          {
            error: "Insufficient credits",
            topUpUrl: "https://www.elizacloud.ai/dashboard/billing",
          },
          402,
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
  } catch (error) {
    return failureResponse(c, error);
  }
});

export default app;

/**
 * Solana RPC Proxy
 *
 * Proxies JSON-RPC requests to a Helius-backed Solana RPC endpoint.
 * The cloud injects its own Helius API key server-side.
 * Deducts credits per RPC call.
 *
 * Usage: POST /api/v1/proxy/solana-rpc
 *        Body: JSON-RPC 2.0 request (or batch)
 */

import { Hono } from "hono";
import { requireUserOrApiKeyWithOrg } from "@/api-lib/auth";
import type { AppEnv } from "@/api-lib/context";
import { failureResponse } from "@/api-lib/errors";
import { creditsService } from "@/lib/services/credits";
import { proxyBillingService } from "@/lib/services/proxy-billing";

const app = new Hono<AppEnv>();

app.post("/", async (c) => {
  try {
    // Support auth via query param for @solana/web3.js Connection which can't send headers.
    const queryApiKey = c.req.query("api_key");
    if (queryApiKey && !c.req.header("authorization") && !c.req.header("X-API-Key")) {
      c.req.raw.headers.set("authorization", `Bearer ${queryApiKey}`);
    }

    const user = await requireUserOrApiKeyWithOrg(c);
    const { organization_id } = user;

    const heliusApiKey = c.env.HELIUS_API_KEY as string | undefined;
    const solanaRpcUrl = heliusApiKey
      ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`
      : "https://api.mainnet-beta.solana.com";

    const body = await c.req.text();

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
      const totalCost = proxyBillingService.getProxyCost("solana-rpc") * requestCount;
      const ok = await creditsService
        .deductCredits({
          organizationId: organization_id,
          amount: totalCost,
          description: `API proxy: solana-rpc — json-rpc (batch of ${requestCount})`,
          metadata: {
            type: "proxy_solana-rpc",
            service: "solana-rpc",
            path: "json-rpc",
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

    const upstreamResponse = await fetch(solanaRpcUrl, {
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

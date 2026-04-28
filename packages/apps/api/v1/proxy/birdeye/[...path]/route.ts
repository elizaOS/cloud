/**
 * Birdeye API Proxy
 *
 * Proxies requests to https://public-api.birdeye.so with the cloud's own
 * Birdeye API key injected server-side. Deducts credits per request.
 *
 * Usage: GET /api/v1/proxy/birdeye/defi/price?address=...
 *        GET /api/v1/proxy/birdeye/v1/wallet/token_list?wallet=...
 */

import { Hono } from "hono";
import { requireUserOrApiKeyWithOrg } from "@/api-lib/auth";
import type { AppEnv } from "@/api-lib/context";
import { failureResponse } from "@/api-lib/errors";
import { proxyBillingService } from "@/lib/services/proxy-billing";
import { logger } from "@/lib/utils/logger";

const BIRDEYE_BASE = "https://public-api.birdeye.so";

const app = new Hono<AppEnv>();

app.get("/*", async (c) => {
  try {
    const pathStr = c.req.param("*") ?? "";

    const user = await requireUserOrApiKeyWithOrg(c);
    const { organization_id } = user;

    const birdeyeApiKey = c.env.BIRDEYE_API_KEY as string | undefined;
    if (!birdeyeApiKey) {
      logger.error("BIRDEYE_API_KEY not configured on cloud server");
      return c.json({ error: "Birdeye proxy not available — server misconfigured" }, 503);
    }

    const deductResult = await proxyBillingService
      .deductProxyCredits({
        organizationId: organization_id,
        userId: user.id,
        service: "birdeye",
        path: pathStr,
      })
      .catch(() => null);

    if (deductResult === null) {
      return c.json(
        {
          error: "Insufficient credits",
          topUpUrl: "https://www.elizacloud.ai/dashboard/billing",
        },
        402,
      );
    }

    const upstreamUrl = new URL(`${BIRDEYE_BASE}/${pathStr}`);
    const url = new URL(c.req.url);
    url.searchParams.forEach((value, key) => {
      upstreamUrl.searchParams.set(key, value);
    });

    const upstreamResponse = await fetch(upstreamUrl.toString(), {
      headers: {
        Accept: "application/json",
        "x-chain": c.req.header("x-chain") ?? "solana",
        "X-API-KEY": birdeyeApiKey,
      },
    });

    const body = await upstreamResponse.text();

    return new Response(body, {
      status: upstreamResponse.status,
      headers: {
        "Content-Type": upstreamResponse.headers.get("Content-Type") ?? "application/json",
      },
    });
  } catch (error) {
    return failureResponse(c, error);
  }
});

export default app;

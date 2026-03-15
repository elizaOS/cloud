/**
 * Birdeye API Proxy
 *
 * Proxies requests to https://public-api.birdeye.so with the cloud's own
 * Birdeye API key injected server-side. Deducts credits per request.
 *
 * Usage: GET /api/v1/proxy/birdeye/defi/price?address=...
 *        GET /api/v1/proxy/birdeye/v1/wallet/token_list?wallet=...
 */

import type { NextRequest } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { proxyBillingService } from "@/lib/services/proxy-billing";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const BIRDEYE_BASE = "https://public-api.birdeye.so";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const pathStr = path.join("/");

  const authResult = await requireAuthOrApiKeyWithOrg(request);
  const { organization_id } = authResult.user;

  const birdeyeApiKey = process.env.BIRDEYE_API_KEY;
  if (!birdeyeApiKey) {
    logger.error("BIRDEYE_API_KEY not configured on cloud server");
    return Response.json(
      { error: "Birdeye proxy not available — server misconfigured" },
      { status: 503 },
    );
  }

  const deductResult = await proxyBillingService
    .deductProxyCredits({
      organizationId: organization_id,
      userId: authResult.user.id,
      service: "birdeye",
      path: pathStr,
    })
    .catch(() => null);

  if (deductResult === null) {
    return Response.json(
      { error: "Insufficient credits", topUpUrl: "https://cloud.milady.ai/dashboard/billing" },
      { status: 402 },
    );
  }

  // Build upstream URL preserving query params
  const upstreamUrl = new URL(`${BIRDEYE_BASE}/${pathStr}`);
  const searchParams = request.nextUrl.searchParams;
  searchParams.forEach((value, key) => {
    upstreamUrl.searchParams.set(key, value);
  });

  // Forward the request to Birdeye
  const upstreamResponse = await fetch(upstreamUrl.toString(), {
    headers: {
      Accept: "application/json",
      "x-chain": request.headers.get("x-chain") ?? "solana",
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
}

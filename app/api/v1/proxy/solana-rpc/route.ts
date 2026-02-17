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

import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { proxyBillingService } from "@/lib/services/proxy-billing";
import { creditsService } from "@/lib/services/credits";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // Support auth via query param for @solana/web3.js Connection which can't send headers
  const queryApiKey = request.nextUrl.searchParams.get("api_key");
  let authRequest = request;
  if (queryApiKey && !request.headers.get("authorization") && !request.headers.get("X-API-Key")) {
    const headers = new Headers(request.headers);
    headers.set("Authorization", `Bearer ${queryApiKey}`);
    authRequest = new NextRequest(request.url, { headers, method: request.method, body: request.body });
  }
  const authResult = await requireAuthOrApiKeyWithOrg(authRequest);
  const { organization_id } = authResult.user;

  const heliusApiKey = process.env.HELIUS_API_KEY;
  const solanaRpcUrl = heliusApiKey
    ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`
    : "https://api.mainnet-beta.solana.com";

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
    const totalCost = proxyBillingService.getProxyCost("solana-rpc") * requestCount;
    const ok = await creditsService.deductCredits({
      organizationId: organization_id,
      amount: totalCost,
      description: `API proxy: solana-rpc — json-rpc (batch of ${requestCount})`,
      metadata: {
        type: "proxy_solana-rpc",
        service: "solana-rpc",
        path: "json-rpc",
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
}

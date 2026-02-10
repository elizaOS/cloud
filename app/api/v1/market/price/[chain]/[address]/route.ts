/**
 * Market Data: Token Price Endpoint
 * 
 * GET /api/v1/market/price/{chain}/{address}
 * 
 * WHY this route exists:
 * - Most common market data query (90% of use cases)
 * - Real-time price is foundation for portfolio tracking, trading, analytics
 * 
 * WHY separate route per method:
 * - RESTful: each resource type has unique URL
 * - Cacheable: CDNs/browsers can cache by URL path
 * - Readable: /market/price/solana/EPj... is self-documenting
 * 
 * WHY validate before executeWithBody:
 * - Fail-fast: reject bad input before billing credits
 * - UX: instant error feedback vs slow upstream error
 * - Cost: prevents wasted credits on invalid requests
 */

import { NextRequest, NextResponse } from "next/server";
import { executeWithBody } from "@/lib/services/proxy/engine";
import {
  marketDataConfig,
  marketDataHandler,
} from "@/lib/services/proxy/services/market-data";
import {
  isValidChain,
  isValidAddress,
} from "@/lib/services/proxy/services/address-validation";

// WHY 30s maxDuration:
// - Vercel serverless functions default to 10s
// - Upstream calls + retries can take 15-20s
// - 30s provides safety margin without blocking too long
export const maxDuration = 30;

function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-API-Key, Cache-Control",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(),
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chain: string; address: string }> },
) {
  const { chain, address } = await params;

  if (!isValidChain(chain)) {
    return NextResponse.json(
      {
        error: "Invalid chain",
        details: "Supported chains: solana, ethereum, arbitrum, avalanche, bsc, optimism, polygon, base, zksync, sui",
      },
      { status: 400 },
    );
  }

  if (!isValidAddress(chain, address)) {
    return NextResponse.json(
      {
        error: "Invalid address format",
        details: `Address format invalid for chain: ${chain}`,
      },
      { status: 400 },
    );
  }

  // WHY this body structure:
  // - method: "getPrice" is provider-agnostic (could be Birdeye, CoinGecko, etc.)
  // - chain: passed through to handler for provider-specific routing
  // - params: flexible object allows adding fields without route changes
  const body = {
    method: "getPrice",
    chain,
    params: { address },
  };

  // WHY executeWithBody not manual billing:
  // - Handles auth, credit reservation, caching, rate limiting automatically
  // - Guarantees credits are refunded on errors
  // - Tracks usage for analytics and billing
  // - Consistent behavior across all service routes
  return executeWithBody(marketDataConfig, marketDataHandler, request, body);
}
}

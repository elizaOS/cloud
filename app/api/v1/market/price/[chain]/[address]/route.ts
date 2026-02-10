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

  const body = {
    method: "getPrice",
    chain,
    params: { address },
  };

  return executeWithBody(marketDataConfig, marketDataHandler, request, body);
}

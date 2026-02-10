import { NextRequest, NextResponse } from "next/server";
import { executeWithBody } from "@/lib/services/proxy/engine";
import { chainDataConfig, chainDataHandler } from "@/lib/services/proxy/services/chain-data";
import { ALCHEMY_SLUGS } from "@/lib/services/proxy/services/rpc";
import { isValidAddress } from "@/lib/services/proxy/services/address-validation";

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
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chain: string; address: string }> },
) {
  const { chain, address } = await params;
  const normalized = chain.toLowerCase();

  // Validate chain
  if (!ALCHEMY_SLUGS[normalized]) {
    const supportedChains = Object.keys(ALCHEMY_SLUGS);
    return NextResponse.json(
      { 
        error: "Unsupported chain for enhanced data", 
        supported: supportedChains 
      },
      { status: 400 },
    );
  }

  // Validate address format
  if (!isValidAddress(normalized, address)) {
    return NextResponse.json(
      { error: "Invalid address format for this chain" },
      { status: 400 },
    );
  }

  // Build request body
  const body = {
    method: "getTokenBalances",
    chain: normalized,
    params: {
      address,
    },
  };

  return executeWithBody(chainDataConfig, chainDataHandler, request, body);
}

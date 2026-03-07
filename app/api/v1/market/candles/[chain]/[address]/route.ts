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
  const normalizedChain = chain.toLowerCase();
  const { searchParams } = new URL(request.url);

  if (!isValidChain(normalizedChain)) {
    return NextResponse.json(
      {
        error: "Invalid chain",
        details:
          "Supported chains: solana, ethereum, arbitrum, avalanche, bsc, optimism, polygon, base, zksync, sui",
      },
      { status: 400 },
    );
  }

  if (!isValidAddress(normalizedChain, address)) {
    return NextResponse.json(
      {
        error: "Invalid address format",
        details: `Address format invalid for chain: ${normalizedChain}`,
      },
      { status: 400 },
    );
  }

  const requestParams: Record<string, string> = { address };

  const type = searchParams.get("type");
  if (type) requestParams.type = type;

  const timeFrom = searchParams.get("time_from");
  if (timeFrom) requestParams.time_from = timeFrom;

  const timeTo = searchParams.get("time_to");
  if (timeTo) requestParams.time_to = timeTo;

  const body = {
    method: "getOHLCV",
    chain: normalizedChain,
    params: requestParams,
  };

  return executeWithBody(marketDataConfig, marketDataHandler, request, body);
}

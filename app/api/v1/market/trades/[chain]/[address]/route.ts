import { NextRequest, NextResponse } from "next/server";
import { executeWithBody } from "@/lib/services/proxy/engine";
import {
  applyCorsHeaders,
  handleCorsOptions,
} from "@/lib/services/proxy/cors";
import {
  marketDataConfig,
  marketDataHandler,
} from "@/lib/services/proxy/services/market-data";
import {
  isValidChain,
  isValidAddress,
} from "@/lib/services/proxy/services/address-validation";

export const maxDuration = 30;
const CORS_METHODS = "GET, OPTIONS";

export async function OPTIONS() {
  return handleCorsOptions(CORS_METHODS);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chain: string; address: string }> },
) {
  const { chain, address } = await params;
  const normalizedChain = chain.toLowerCase();
  const { searchParams } = new URL(request.url);

  if (!isValidChain(normalizedChain)) {
    return applyCorsHeaders(
      NextResponse.json(
        {
          error: "Invalid chain",
          details:
            "Supported chains: solana, ethereum, arbitrum, avalanche, bsc, optimism, polygon, base, zksync, sui",
        },
        { status: 400 },
      ),
      CORS_METHODS,
    );
  }

  if (!isValidAddress(normalizedChain, address)) {
    return applyCorsHeaders(
      NextResponse.json(
        {
          error: "Invalid address format",
          details: `Address format invalid for chain: ${normalizedChain}`,
        },
        { status: 400 },
      ),
      CORS_METHODS,
    );
  }

  const requestParams: Record<string, string> = { address };

  const limit = searchParams.get("limit");
  if (limit) requestParams.limit = limit;

  const offset = searchParams.get("offset");
  if (offset) requestParams.offset = offset;

  const txType = searchParams.get("tx_type");
  if (txType) requestParams.tx_type = txType;

  const body = {
    method: "getTokenTrades",
    chain: normalizedChain,
    params: requestParams,
  };

  return applyCorsHeaders(
    await executeWithBody(marketDataConfig, marketDataHandler, request, body),
    CORS_METHODS,
  );
}

import { NextRequest, NextResponse } from "next/server";
import { applyCorsHeaders, handleCorsOptions } from "@/lib/services/proxy/cors";
import { executeWithBody } from "@/lib/services/proxy/engine";
import { isValidAddress, isValidChain } from "@/lib/services/proxy/services/address-validation";
import { marketDataConfig, marketDataHandler } from "@/lib/services/proxy/services/market-data";

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

  return applyCorsHeaders(
    await executeWithBody(marketDataConfig, marketDataHandler, request, body),
    CORS_METHODS,
  );
}

import { NextRequest, NextResponse } from "next/server";
import { executeWithBody } from "@/lib/services/proxy/engine";
import {
  applyCorsHeaders,
  handleCorsOptions,
} from "@/lib/services/proxy/cors";
import { chainDataConfig, chainDataHandler } from "@/lib/services/proxy/services/chain-data";
import { ALCHEMY_SLUGS } from "@/lib/services/proxy/services/rpc";
import { isValidAddress } from "@/lib/services/proxy/services/address-validation";

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
  const normalized = chain.toLowerCase();

  // Validate chain
  if (!ALCHEMY_SLUGS[normalized]) {
    const supportedChains = Object.keys(ALCHEMY_SLUGS);
    return applyCorsHeaders(
      NextResponse.json(
        {
          error: "Unsupported chain for enhanced data",
          supported: supportedChains,
        },
        { status: 400 },
      ),
      CORS_METHODS,
    );
  }

  // Validate address format
  if (!isValidAddress(normalized, address)) {
    return applyCorsHeaders(
      NextResponse.json(
        { error: "Invalid address format for this chain" },
        { status: 400 },
      ),
      CORS_METHODS,
    );
  }

  // Build request body with query params
  const searchParams = new URL(request.url).searchParams;
  const body = {
    method: "getNFTsForOwner",
    chain: normalized,
    params: {
      owner: address,
      pageSize: searchParams.get("pageSize"),
      pageKey: searchParams.get("pageKey"),
      contractAddresses: searchParams.get("contractAddresses"),
      withMetadata: searchParams.get("withMetadata"),
      excludeFilters: searchParams.get("excludeFilters"),
    },
  };

  return applyCorsHeaders(
    await executeWithBody(chainDataConfig, chainDataHandler, request, body),
    CORS_METHODS,
  );
}

import { NextRequest } from "next/server";
import { withRateLimit } from "@/lib/middleware/rate-limit";
import {
  handlePublicMarketDataPreviewRequest,
  PUBLIC_MARKET_PREVIEW_CORS_METHODS,
  PUBLIC_MARKET_TOKEN_RATE_LIMIT,
} from "@/lib/services/market-preview";
import { applyCorsHeaders, handleCorsOptions } from "@/lib/services/proxy/cors";

export const maxDuration = 30;

export async function OPTIONS() {
  return handleCorsOptions(PUBLIC_MARKET_PREVIEW_CORS_METHODS);
}

async function handleGET(
  _request: NextRequest,
  { params }: { params: Promise<{ chain: string; address: string }> },
) {
  const { chain, address } = await params;
  return applyCorsHeaders(
    await handlePublicMarketDataPreviewRequest({
      chain,
      address,
      method: "getTokenOverview",
      parameterName: "address",
      routeLabel: "token-preview",
    }),
    PUBLIC_MARKET_PREVIEW_CORS_METHODS,
  );
}

export const GET = withRateLimit(handleGET, PUBLIC_MARKET_TOKEN_RATE_LIMIT);

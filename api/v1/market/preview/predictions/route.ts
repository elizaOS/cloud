import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/lib/middleware/rate-limit";
import {
  loadPublicPredictionPreview,
  PUBLIC_MARKET_PREVIEW_CORS_METHODS,
  PUBLIC_PREDICTIONS_RATE_LIMIT,
  wrapPredictionPreviewResponse,
} from "@/lib/services/market-preview";
import { applyCorsHeaders, handleCorsOptions } from "@/lib/services/proxy/cors";

export const maxDuration = 30;

export async function OPTIONS() {
  return handleCorsOptions(PUBLIC_MARKET_PREVIEW_CORS_METHODS);
}

async function handleGET(_request: NextRequest) {
  try {
    return applyCorsHeaders(
      wrapPredictionPreviewResponse(await loadPublicPredictionPreview()),
      PUBLIC_MARKET_PREVIEW_CORS_METHODS,
    );
  } catch {
    return applyCorsHeaders(
      NextResponse.json({ error: "Failed to load prediction preview" }, { status: 502 }),
      PUBLIC_MARKET_PREVIEW_CORS_METHODS,
    );
  }
}

export const GET = withRateLimit(handleGET, PUBLIC_PREDICTIONS_RATE_LIMIT);

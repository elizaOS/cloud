/**
 * Solana RPC Proxy Endpoint
 *
 * Public API for proxying Solana RPC requests with rate limiting and billing.
 *
 * CORS: Unrestricted by design - see lib/services/proxy/cors.ts for security rationale.
 * Authentication: API key required (X-API-Key header)
 * Rate Limiting: Per API key
 * Billing: Usage tracked per organization
 */

import { NextRequest, NextResponse } from "next/server";
import { applyCorsHeaders, handleCorsOptions } from "@/lib/services/proxy/cors";
import { createHandler } from "@/lib/services/proxy/engine";
import { rpcConfigForChain, rpcHandlerForChain } from "@/lib/services/proxy/services/rpc";

export const maxDuration = 30;
const CORS_METHODS = "POST, OPTIONS";

export async function OPTIONS() {
  return handleCorsOptions(CORS_METHODS);
}

const basePostHandler = createHandler(rpcConfigForChain("solana"), rpcHandlerForChain("solana"));

export async function POST(request: NextRequest) {
  try {
    return applyCorsHeaders(await basePostHandler(request), CORS_METHODS);
  } catch {
    return applyCorsHeaders(
      new NextResponse("Internal Server Error", { status: 500 }),
      CORS_METHODS,
    );
  }
}

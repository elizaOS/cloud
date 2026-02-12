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

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createHandler } from "@/lib/services/proxy/engine";
import { solanaRpcConfig, solanaRpcHandler } from "@/lib/services/proxy/services/solana-rpc";
import { handleCorsOptions, getCorsHeaders } from "@/lib/services/proxy/cors";

export const maxDuration = 30;

export async function OPTIONS() {
  return handleCorsOptions("POST, OPTIONS");
}

const basePostHandler = createHandler(solanaRpcConfig, solanaRpcHandler);

export async function POST(request: NextRequest) {
  const corsHeaders = getCorsHeaders("POST, OPTIONS");
  
  try {
    const response = await basePostHandler(request);

    // Add CORS headers to response
    for (const [key, value] of Object.entries(corsHeaders)) {
      response.headers.set(key, value);
    }

    return response;
  } catch {
    return new NextResponse("Internal Server Error", {
      status: 500,
      headers: getCorsHeaders("POST, OPTIONS"),
    });
  }
}

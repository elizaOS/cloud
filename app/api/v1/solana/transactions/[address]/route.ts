/**
 * Solana Transactions API - Get transactions by address
 *
 * Public API for retrieving transaction history for a Solana address.
 *
 * CORS: Unrestricted by design - see lib/services/proxy/cors.ts for security rationale.
 * Authentication: API key required (X-API-Key header)
 * Rate Limiting: Per API key
 */

import { NextRequest, NextResponse } from "next/server";
import { executeWithBody } from "@/lib/services/proxy/engine";
import {
  solanaRpcConfig,
  solanaRpcHandler,
} from "@/lib/services/proxy/services/solana-rpc";
import { isValidSolanaAddress } from "@/lib/services/proxy/services/solana-validation";
import {
  getCorsHeaders,
  handleCorsOptions,
} from "@/lib/services/proxy/cors";

export const maxDuration = 30;

export async function OPTIONS() {
  return handleCorsOptions("GET, OPTIONS");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;

  if (!isValidSolanaAddress(address)) {
    return NextResponse.json(
      {
        error: "Invalid Solana address",
        details: "Address must be a valid base58-encoded public key",
      },
      {
        status: 400,
        headers: getCorsHeaders("GET, OPTIONS"),
      },
    );
  }

  const body = {
    jsonrpc: "2.0",
    id: "eliza-cloud",
    method: "getTransactionsForAddress",
    params: {
      address,
    },
  };

  try {
    const response = await executeWithBody(
      solanaRpcConfig,
      solanaRpcHandler,
      request,
      body,
    );

    const corsHeaders = getCorsHeaders("GET, OPTIONS");
    for (const [key, value] of Object.entries(corsHeaders)) {
      response.headers.set(key, value);
    }

    return response;
  } catch {
    return new NextResponse("Internal Server Error", {
      status: 500,
      headers: getCorsHeaders("GET, OPTIONS"),
    });
  }
}

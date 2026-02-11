/**
 * Solana Assets API - Get assets by owner address
 * 
 * Public API for retrieving Solana NFTs and tokens owned by an address.
 * 
 * CORS: Unrestricted by design - see lib/services/proxy/cors.ts for security rationale.
 * Authentication: API key required (X-API-Key header)
 * Rate Limiting: Per API key
 */

import { NextRequest, NextResponse } from "next/server";
import { executeWithBody } from "@/lib/services/proxy/engine";
import { solanaRpcConfig, solanaRpcHandler } from "@/lib/services/proxy/services/solana-rpc";
import { isValidSolanaAddress } from "@/lib/services/proxy/services/solana-validation";
import { handleCorsOptions, getCorsHeaders } from "@/lib/services/proxy/cors";

export const maxDuration = 30;

export async function OPTIONS() {
  return handleCorsOptions("GET, OPTIONS");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;

  // Validate Solana address format to prevent DoS and invalid requests
  if (!isValidSolanaAddress(address)) {
    const corsHeaders = getCorsHeaders();
    return NextResponse.json(
      { 
        error: "Invalid Solana address",
        details: "Address must be a valid base58-encoded public key"
      },
      { status: 400, headers: corsHeaders },
    );
  }

  const body = {
    jsonrpc: "2.0",
    id: "eliza-cloud",
    method: "getAssetsByOwner",
    params: {
      ownerAddress: address,
      page: 1,
      limit: 1000,
    },
  };

  const response = await executeWithBody(solanaRpcConfig, solanaRpcHandler, request, body);
  
  const corsHeaders = getCorsHeaders();
  for (const [key, value] of Object.entries(corsHeaders)) {
    response.headers.set(key, value);
  }

  return response;

  const response = await executeWithBody(solanaRpcConfig, solanaRpcHandler, request, body);
  
  // Add CORS headers to response
  const corsHeaders = getCorsHeaders();
  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  
  return response;
}

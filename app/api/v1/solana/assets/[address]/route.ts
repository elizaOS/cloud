import { NextRequest, NextResponse } from "next/server";
import { executeWithBody } from "@/lib/services/proxy/engine";
import { solanaRpcConfig, solanaRpcHandler } from "@/lib/services/proxy/services/solana-rpc";
import { isValidSolanaAddress } from "@/lib/services/proxy/services/solana-validation";

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
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;

  // Validate Solana address format to prevent DoS and invalid requests
  if (!isValidSolanaAddress(address)) {
    return NextResponse.json(
      { 
        error: "Invalid Solana address format",
        details: "Address must be 32-44 base58-encoded characters"
      },
      { status: 400 },
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

  return executeWithBody(solanaRpcConfig, solanaRpcHandler, request, body);
}

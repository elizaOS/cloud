import { NextRequest, NextResponse } from "next/server";
import { createHandler } from "@/lib/services/proxy/engine";
import {
  rpcConfigForChain,
  rpcHandlerForChain,
  isValidRpcChain,
  SUPPORTED_RPC_CHAINS,
} from "@/lib/services/proxy/services/rpc";

export const maxDuration = 30;

function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-API-Key, Cache-Control",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chain: string }> },
) {
  const { chain } = await params;
  const normalized = chain.toLowerCase();

  if (!isValidRpcChain(normalized)) {
    return NextResponse.json(
      { error: "Unsupported chain", supported: [...SUPPORTED_RPC_CHAINS] },
      { status: 400 },
    );
  }

  const config = rpcConfigForChain(normalized);
  const handler = createHandler(config, rpcHandlerForChain(normalized));
  return handler(request);
}

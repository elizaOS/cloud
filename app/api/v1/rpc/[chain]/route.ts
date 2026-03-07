import { NextRequest, NextResponse } from "next/server";
import { createHandler } from "@/lib/services/proxy/engine";
import {
  applyCorsHeaders,
  handleCorsOptions,
} from "@/lib/services/proxy/cors";
import {
  rpcConfigForChain,
  rpcHandlerForChain,
  isValidRpcChain,
  SUPPORTED_RPC_CHAINS,
} from "@/lib/services/proxy/services/rpc";

export const maxDuration = 30;
const CORS_METHODS = "POST, OPTIONS";

export async function OPTIONS() {
  return handleCorsOptions(CORS_METHODS);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chain: string }> },
) {
  const { chain } = await params;
  const normalized = chain.toLowerCase();

  if (!isValidRpcChain(normalized)) {
    return applyCorsHeaders(
      NextResponse.json(
        { error: "Unsupported chain", supported: [...SUPPORTED_RPC_CHAINS] },
        { status: 400 },
      ),
      CORS_METHODS,
    );
  }

  const config = rpcConfigForChain(normalized);
  const handler = createHandler(config, rpcHandlerForChain(normalized));
  return applyCorsHeaders(await handler(request), CORS_METHODS);
}

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

import { createHandler } from "@/lib/services/proxy/engine";
import { solanaRpcConfig, solanaRpcHandler } from "@/lib/services/proxy/services/solana-rpc";
import { handleCorsOptions } from "@/lib/services/proxy/cors";

export const maxDuration = 30;

export async function OPTIONS() {
  return handleCorsOptions("POST, OPTIONS");
}

export const POST = createHandler(solanaRpcConfig, solanaRpcHandler);

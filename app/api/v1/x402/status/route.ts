/**
 * x402 Status/Health Check Endpoint
 *
 * Returns the current configuration and health status of x402 payments.
 * Useful for monitoring and debugging payment integration.
 *
 * GET /api/v1/x402/status
 */

import { NextResponse } from "next/server";
import {
  X402_ENABLED,
  X402_RECIPIENT_ADDRESS,
  isX402Configured,
  getDefaultNetwork,
  TOPUP_PRICE,
  CREDITS_PER_DOLLAR,
  USDC_ADDRESSES,
  CHAIN_IDS,
} from "@/lib/config/x402";
import { isFacilitatorConfigured } from "@/lib/middleware/x402-payment";

export async function GET() {
  const network = getDefaultNetwork();

  const status = {
    enabled: X402_ENABLED,
    configured: isX402Configured(),
    network,
    chainId: CHAIN_IDS[network],
    
    // Configuration details
    config: {
      recipientAddress: X402_RECIPIENT_ADDRESS,
      recipientConfigured: X402_RECIPIENT_ADDRESS !== "0x0000000000000000000000000000000000000000",
      usdcAddress: USDC_ADDRESSES[network],
      topupPrice: TOPUP_PRICE,
      creditsPerDollar: CREDITS_PER_DOLLAR,
    },

    // Facilitator status
    facilitator: {
      configured: isFacilitatorConfigured(),
      type: isFacilitatorConfigured() ? "cdp" : "public",
      warning: !isFacilitatorConfigured()
        ? "Using public facilitator - has rate limits. Set CDP_API_KEY_ID and CDP_API_KEY_SECRET for production."
        : null,
    },

    // Endpoints
    endpoints: {
      topup: "/api/v1/credits/topup",
      weatherMcp: "/api/mcp/demos/weather",
      timeMcp: "/api/mcp/demos/time",
    },

    // Health checks
    health: {
      recipientValid: isValidAddress(X402_RECIPIENT_ADDRESS),
      usdcValid: isValidAddress(USDC_ADDRESSES[network]),
      ready: isX402Configured() && isValidAddress(X402_RECIPIENT_ADDRESS),
    },
  };

  return NextResponse.json(status);
}

function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address) && 
         address !== "0x0000000000000000000000000000000000000000";
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}


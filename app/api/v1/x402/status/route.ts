/**
 * x402 Status/Health Check Endpoint
 *
 * Returns the current configuration and health status of x402 payments.
 * Supports multi-chain configuration (Jeju + Base) with cross-chain payments.
 *
 * GET /api/v1/x402/status
 */

import { NextResponse } from "next/server";
import {
  X402_ENABLED,
  X402_RECIPIENT_ADDRESS,
  isX402Configured,
  getDefaultNetwork,
  getFallbackNetwork,
  getNetworkEcosystem,
  TOPUP_PRICE,
  CREDITS_PER_DOLLAR,
  USDC_ADDRESSES,
  CHAIN_IDS,
  SUPPORTED_NETWORKS,
  JEJU_NETWORKS,
  BASE_NETWORKS,
  isCrossChainEnabled,
  getSupportedSourceChains,
  isAccountAbstractionEnabled,
  isPaymasterEnabled,
  type X402Network,
} from "@/lib/config/x402";
import { 
  isFacilitatorConfigured, 
  isDecentralizedFacilitator,
  getX402Status as getFullStatus,
} from "@/lib/middleware/x402-payment";
import { oifRouter } from "@/lib/services/oif-router";

export async function GET() {
  const network = getDefaultNetwork();
  const fallbackNetwork = getFallbackNetwork();
  const ecosystem = getNetworkEcosystem(network);
  const isDecentralized = isDecentralizedFacilitator(network);

  // Get network statuses
  const networkStatuses = SUPPORTED_NETWORKS.map(net => ({
    network: net,
    chainId: CHAIN_IDS[net],
    ecosystem: getNetworkEcosystem(net),
    usdcConfigured: isValidAddress(USDC_ADDRESSES[net]),
    facilitatorConfigured: isFacilitatorConfigured(net),
    isDecentralized: isDecentralizedFacilitator(net),
  }));

  const status = {
    enabled: X402_ENABLED,
    configured: isX402Configured(),
    
    // Current network
    network: {
      current: network,
      fallback: fallbackNetwork,
      ecosystem,
      chainId: CHAIN_IDS[network],
    },
    
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
      configured: isFacilitatorConfigured(network),
      type: isDecentralized ? "decentralized" : (isFacilitatorConfigured(network) ? "cdp" : "public"),
      isDecentralized,
      warning: getDecentralizedWarning(network, isDecentralized),
    },

    // Multi-chain support
    multiChain: {
      enabled: true,
      ecosystems: {
        jeju: {
          networks: JEJU_NETWORKS,
          facilitator: "decentralized",
          credentialsRequired: false,
        },
        base: {
          networks: BASE_NETWORKS,
          facilitator: "cdp",
          credentialsRequired: true,
        },
      },
      networkStatuses,
    },

    // Cross-chain payments via OIF
    crossChain: {
      enabled: isCrossChainEnabled(),
      oifAvailable: oifRouter.isAvailable(),
      supportedSourceChains: getSupportedSourceChains(),
      settlementChain: network,
      settlementFallback: fallbackNetwork,
    },

    // Account abstraction
    accountAbstraction: {
      enabled: isAccountAbstractionEnabled(),
      paymasterEnabled: isPaymasterEnabled(),
      gasSponsored: isPaymasterEnabled(),
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
      facilitatorReady: isFacilitatorConfigured(network),
      ready: isX402Configured() && isValidAddress(X402_RECIPIENT_ADDRESS),
      jejuReady: JEJU_NETWORKS.some(n => isFacilitatorConfigured(n)),
      baseReady: BASE_NETWORKS.some(n => isFacilitatorConfigured(n)),
    },
  };

  return NextResponse.json(status);
}

function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address) && 
         address !== "0x0000000000000000000000000000000000000000";
}

function getDecentralizedWarning(network: X402Network, isDecentralized: boolean): string | null {
  if (isDecentralized) {
    return null; // No warning for Jeju decentralized facilitator
  }
  
  if (!isFacilitatorConfigured(network)) {
    return "Using public facilitator for Base - has rate limits. " +
           "Set CDP_API_KEY_ID and CDP_API_KEY_SECRET, or use Jeju network (no credentials required).";
  }
  
  return null;
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


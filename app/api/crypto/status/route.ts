import { NextResponse } from "next/server";
import { X402_ENABLED, getDefaultNetwork, getNetworkConfig } from "@/lib/config/x402";

/**
 * Supported tokens for crypto payments
 * These are the tokens that can be used to purchase credits
 */
const SUPPORTED_TOKENS = [
  {
    symbol: "USDC",
    name: "USD Coin",
    networks: ["base", "base-sepolia"],
    enabled: true,
  },
  {
    symbol: "USDT",
    name: "Tether USD",
    networks: ["base"],
    enabled: false, // Not yet supported
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    networks: ["base", "base-sepolia"],
    enabled: false, // Not yet supported
  },
] as const;

export interface CryptoStatusResponse {
  enabled: boolean;
  supportedTokens: string[];
  allTokens: Array<{
    symbol: string;
    name: string;
    networks: readonly string[];
    enabled: boolean;
  }>;
  network: string;
  networkName: string;
  isTestnet: boolean;
}

/**
 * GET /api/crypto/status
 * Returns the status of crypto payments and the list of supported tokens.
 *
 * @returns Crypto payment configuration including supported tokens.
 */
export async function GET(): Promise<NextResponse<CryptoStatusResponse>> {
  const network = getDefaultNetwork();
  const networkConfig = getNetworkConfig(network);

  // Filter to only enabled tokens that support the current network
  const enabledTokens = SUPPORTED_TOKENS.filter(
    (token) => token.enabled && token.networks.includes(network)
  );

  return NextResponse.json({
    enabled: X402_ENABLED,
    supportedTokens: enabledTokens.map((t) => t.symbol),
    allTokens: [...SUPPORTED_TOKENS],
    network,
    networkName: networkConfig.name,
    isTestnet: networkConfig.isTestnet,
  });
}


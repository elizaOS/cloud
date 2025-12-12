import { NextResponse } from "next/server";
import {
  isCdpConfigured,
  getDefaultNetwork,
  cdpWalletService,
} from "@/lib/services/cdp-wallet";

export async function GET() {
  const configured = isCdpConfigured();
  const defaultNetwork = getDefaultNetwork();
  const networks = cdpWalletService.getSupportedNetworks();

  const networkConfigs = networks.map((network) => {
    const config = cdpWalletService.getNetworkConfig(network);
    return {
      id: network,
      name: network === "base" ? "Base Mainnet" : "Base Sepolia",
      chainId: config.chainId,
      usdcAddress: config.usdcAddress,
      isTestnet: config.isTestnet,
    };
  });

  return NextResponse.json({
    enabled: configured,
    defaultNetwork,
    networks: networkConfigs,
    limits: {
      min: 5,
      max: 1000,
    },
    supportedTokens: ["USDC"],
  });
}

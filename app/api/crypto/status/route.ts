import { NextResponse } from "next/server";
import { isOxaPayConfigured, oxaPayService } from "@/lib/services/oxapay";
import { logger } from "@/lib/utils/logger";

export async function GET() {
  const configured = isOxaPayConfigured();

  const networks = [
    { id: "ERC20", name: "Ethereum", chainId: 1 },
    { id: "TRC20", name: "Tron", chainId: null },
    { id: "BEP20", name: "BNB Smart Chain", chainId: 56 },
    { id: "POLYGON", name: "Polygon", chainId: 137 },
    { id: "SOL", name: "Solana", chainId: null },
    { id: "BASE", name: "Base", chainId: 8453 },
    { id: "ARB", name: "Arbitrum", chainId: 42161 },
    { id: "OP", name: "Optimism", chainId: 10 },
  ];

  if (!configured) {
    return NextResponse.json({
      enabled: false,
      networks: [],
      supportedTokens: [],
      limits: { min: 1, max: 10000 },
    });
  }

  let supportedTokens: string[] = ["USDT", "USDC", "BTC", "ETH", "LTC", "TRX"];
  let currencies: Array<{ symbol: string; name: string }> = [];

  try {
    const fetchedCurrencies = await oxaPayService.getSupportedCurrencies();
    supportedTokens = fetchedCurrencies.map((c) => c.symbol);
    currencies = fetchedCurrencies.slice(0, 20);
  } catch (error) {
    logger.warn("[Crypto Status API] Could not fetch currencies, using defaults:", error);
  }

  return NextResponse.json({
    enabled: true,
    networks,
    supportedTokens,
    currencies,
    limits: {
      min: 1,
      max: 10000,
    },
    provider: "oxapay",
  });
}

/**
 * DeFi Module Exports Tests
 *
 * Verifies all expected exports are available and typed correctly.
 */

import { describe, test, expect } from "bun:test";

describe("DeFi Module Exports", () => {
  test("exports all service getters", async () => {
    const defi = await import("@/lib/services/defi");

    // Service getters
    expect(typeof defi.getBirdeyeService).toBe("function");
    expect(typeof defi.getJupiterService).toBe("function");
    expect(typeof defi.getCoinGeckoService).toBe("function");
    expect(typeof defi.getHeliusService).toBe("function");
    expect(typeof defi.getCoinMarketCapService).toBe("function");
    expect(typeof defi.getZeroExService).toBe("function");
    expect(typeof defi.getDefinedService).toBe("function");

    // Reset functions
    expect(typeof defi.resetBirdeyeService).toBe("function");
    expect(typeof defi.resetJupiterService).toBe("function");
    expect(typeof defi.resetCoinGeckoService).toBe("function");
    expect(typeof defi.resetHeliusService).toBe("function");
    expect(typeof defi.resetCoinMarketCapService).toBe("function");
    expect(typeof defi.resetZeroExService).toBe("function");
    expect(typeof defi.resetDefinedService).toBe("function");
  });

  test("exports all operation functions", async () => {
    const defi = await import("@/lib/services/defi");

    expect(typeof defi.fetchTokenPrice).toBe("function");
    expect(typeof defi.fetchTrendingTokens).toBe("function");
    expect(typeof defi.fetchMarketOverview).toBe("function");
    expect(typeof defi.fetchSolanaTokenOverview).toBe("function");
    expect(typeof defi.fetchSolanaWalletPortfolio).toBe("function");
    expect(typeof defi.fetchJupiterQuote).toBe("function");
    expect(typeof defi.fetchHeliusTransactions).toBe("function");
    expect(typeof defi.fetchZeroExQuote).toBe("function");
    expect(typeof defi.searchTokens).toBe("function");
    expect(typeof defi.fetchTokenHolders).toBe("function");
    expect(typeof defi.fetchOHLCV).toBe("function");
    expect(typeof defi.checkServicesHealth).toBe("function");
  });

  test("exports service classes", async () => {
    const defi = await import("@/lib/services/defi");

    expect(defi.BirdeyeService).toBeDefined();
    expect(defi.JupiterService).toBeDefined();
    expect(defi.CoinGeckoService).toBeDefined();
    expect(defi.HeliusService).toBeDefined();
    expect(defi.CoinMarketCapService).toBeDefined();
    expect(defi.ZeroExService).toBeDefined();
    expect(defi.DefinedService).toBeDefined();
  });

  test("exports BaseHttpClient", async () => {
    const defi = await import("@/lib/services/defi");
    expect(defi.BaseHttpClient).toBeDefined();
    expect(typeof defi.BaseHttpClient).toBe("function");
  });

  test("exports CHAIN_METADATA constant", async () => {
    const defi = await import("@/lib/services/defi");

    expect(defi.CHAIN_METADATA).toBeDefined();
    expect(typeof defi.CHAIN_METADATA).toBe("object");

    // Verify expected chains
    expect(defi.CHAIN_METADATA.solana).toBeDefined();
    expect(defi.CHAIN_METADATA.ethereum).toBeDefined();
    expect(defi.CHAIN_METADATA.base).toBeDefined();
    expect(defi.CHAIN_METADATA.arbitrum).toBeDefined();
    expect(defi.CHAIN_METADATA.polygon).toBeDefined();
    expect(defi.CHAIN_METADATA.bsc).toBeDefined();
    expect(defi.CHAIN_METADATA.avalanche).toBeDefined();
    expect(defi.CHAIN_METADATA.optimism).toBeDefined();
  });

  test("chain metadata has correct structure", async () => {
    const { CHAIN_METADATA } = await import("@/lib/services/defi");

    for (const [chainId, metadata] of Object.entries(CHAIN_METADATA)) {
      expect(typeof metadata.name).toBe("string");
      expect(typeof metadata.nativeCurrency).toBe("string");
      expect(typeof metadata.decimals).toBe("number");
      expect(typeof metadata.isEVM).toBe("boolean");

      // Solana should not be EVM
      if (chainId === "solana") {
        expect(metadata.isEVM).toBe(false);
      } else {
        expect(metadata.isEVM).toBe(true);
      }
    }
  });

  test("exports getAllDeFiServices helper", async () => {
    const defi = await import("@/lib/services/defi");

    expect(typeof defi.getAllDeFiServices).toBe("function");
  });

  test("exports checkAllServicesHealth helper", async () => {
    const defi = await import("@/lib/services/defi");

    expect(typeof defi.checkAllServicesHealth).toBe("function");
  });
});

describe("Type Definitions", () => {
  test("TokenInfo type has required fields", async () => {
    // This is a compile-time check - if the types are wrong, TS will error
    const token: import("@/lib/services/defi").TokenInfo = {
      address: "0x123",
      symbol: "TKN",
      name: "Token",
      decimals: 18,
      chainId: "ethereum",
    };

    expect(token.address).toBe("0x123");
    expect(token.symbol).toBe("TKN");
  });

  test("TokenPrice type has required fields", async () => {
    const price: import("@/lib/services/defi").TokenPrice = {
      address: "0x123",
      symbol: "TKN",
      priceUsd: 1.5,
    };

    expect(price.priceUsd).toBe(1.5);
  });

  test("SwapQuote type has required fields", async () => {
    const quote: import("@/lib/services/defi").SwapQuote = {
      inputToken: { address: "A", symbol: "A", name: "A", decimals: 18, chainId: "ethereum" },
      outputToken: { address: "B", symbol: "B", name: "B", decimals: 18, chainId: "ethereum" },
      inputAmount: "1000",
      outputAmount: "900",
      priceImpactPercent: 0.1,
      routes: [{ protocol: "Uniswap", portion: 100 }],
    };

    expect(quote.inputAmount).toBe("1000");
    expect(quote.routes).toHaveLength(1);
  });

  test("MarketOverview type has required fields", async () => {
    const overview: import("@/lib/services/defi").MarketOverview = {
      totalMarketCapUsd: 2500000000000,
      totalVolume24hUsd: 100000000000,
      btcDominance: 50,
      ethDominance: 18,
      activeCoins: 15000,
      lastUpdated: new Date(),
    };

    expect(overview.totalMarketCapUsd).toBe(2500000000000);
  });
});

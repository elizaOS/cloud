/**
 * DeFi Operations - Comprehensive Tests
 *
 * Tests edge cases, error handling, concurrent behavior, and data transformations.
 */

import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  mock,
  spyOn,
} from "bun:test";

// Store original fetch
const originalFetch = global.fetch;

// Mock responses for different APIs
const createMockResponse = (
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers(headers),
  json: () => Promise.resolve(data),
  text: () => Promise.resolve(JSON.stringify(data)),
});

// Set required env vars
process.env.BIRDEYE_API_KEY = "test-birdeye-key";
process.env.HELIUS_API_KEY = "test-helius-key";
process.env.COINMARKETCAP_API_KEY = "test-cmc-key";
process.env.ZEROEX_API_KEY = "test-0x-key";
process.env.DEFINED_API_KEY = "test-defined-key";
process.env.COINGECKO_API_KEY = "test-cg-key";
process.env.JUPITER_API_KEY = "test-jupiter-key";

// Reset service singletons between tests
import {
  resetBirdeyeService,
  resetJupiterService,
  resetCoinGeckoService,
  resetHeliusService,
  resetCoinMarketCapService,
  resetZeroExService,
  resetDefinedService,
} from "@/lib/services/defi";

import {
  fetchTokenPrice,
  fetchTrendingTokens,
  fetchMarketOverview,
  fetchSolanaTokenOverview,
  fetchSolanaWalletPortfolio,
  fetchJupiterQuote,
  fetchHeliusTransactions,
  fetchZeroExQuote,
  searchTokens,
  fetchTokenHolders,
  fetchOHLCV,
  checkServicesHealth,
} from "@/lib/services/defi/operations";

function resetAllServices() {
  resetBirdeyeService();
  resetJupiterService();
  resetCoinGeckoService();
  resetHeliusService();
  resetCoinMarketCapService();
  resetZeroExService();
  resetDefinedService();
}

describe("DeFi Operations", () => {
  beforeEach(() => {
    resetAllServices();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("fetchTokenPrice", () => {
    test("transforms Birdeye response correctly", async () => {
      const mockData = {
        success: true,
        data: {
          value: 156.78,
          updateUnixTime: 1700000000,
          updateHumanTime: "2023-11-14T00:00:00Z",
          priceChange24h: -2.5,
        },
      };

      global.fetch = mock(() => Promise.resolve(createMockResponse(mockData)));

      const result = await fetchTokenPrice(
        "birdeye",
        "So11111111111111111111111111111111111111112",
      );

      expect(result.source).toBe("birdeye");
      expect(result.identifier).toBe(
        "So11111111111111111111111111111111111111112",
      );
      expect(result.priceUsd).toBe(156.78);
      expect(result.priceChange24h).toBe(-2.5);
      expect(result.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test("handles zero price", async () => {
      global.fetch = mock(() =>
        Promise.resolve(
          createMockResponse({
            success: true,
            data: {
              value: 0,
              updateUnixTime: Date.now() / 1000,
              priceChange24h: 0,
            },
          }),
        ),
      );

      const result = await fetchTokenPrice("birdeye", "dead-token");
      expect(result.priceUsd).toBe(0);
    });

    test("handles negative price change", async () => {
      global.fetch = mock(() =>
        Promise.resolve(
          createMockResponse({
            success: true,
            data: {
              value: 100,
              updateUnixTime: Date.now() / 1000,
              priceChange24h: -99.9,
            },
          }),
        ),
      );

      const result = await fetchTokenPrice("birdeye", "crashed-token");
      expect(result.priceChange24h).toBe(-99.9);
    });

    test("throws on unsupported source", async () => {
      await expect(
        fetchTokenPrice("invalid" as "birdeye", "test"),
      ).rejects.toThrow("Unsupported source: invalid");
    });

    test("propagates API errors", async () => {
      global.fetch = mock(() =>
        Promise.resolve(createMockResponse({ error: "Token not found" }, 404)),
      );

      await expect(fetchTokenPrice("birdeye", "nonexistent")).rejects.toThrow();
    });

    test("handles missing optional fields", async () => {
      global.fetch = mock(() =>
        Promise.resolve(
          createMockResponse({
            success: true,
            data: { value: 50, updateUnixTime: Date.now() / 1000 },
          }),
        ),
      );

      const result = await fetchTokenPrice("birdeye", "minimal-token");
      expect(result.priceUsd).toBe(50);
      expect(result.priceChange24h).toBeUndefined();
      expect(result.volume24h).toBeUndefined();
      expect(result.marketCap).toBeUndefined();
    });

    test("works with Birdeye source", async () => {
      global.fetch = mock(() =>
        Promise.resolve(
          createMockResponse({
            success: true,
            data: { value: 100, updateUnixTime: Date.now() / 1000 },
          }),
        ),
      );

      const result = await fetchTokenPrice("birdeye", "test-token");
      expect(result.source).toBe("birdeye");
      expect(result.priceUsd).toBe(100);
    });

    test("works with Jupiter source", async () => {
      global.fetch = mock(() =>
        Promise.resolve(
          createMockResponse({
            data: {
              "test-token": {
                id: "test-token",
                type: "derivedPrice",
                price: "100.5",
              },
            },
            timeTaken: 0.1,
          }),
        ),
      );

      const result = await fetchTokenPrice("jupiter", "test-token");
      expect(result.source).toBe("jupiter");
      expect(result.priceUsd).toBe(100.5);
    });

    test("works with CoinGecko source", async () => {
      global.fetch = mock(() =>
        Promise.resolve(
          createMockResponse({
            "test-token": {
              usd: 100,
              usd_24h_change: 5,
              usd_market_cap: 1000000,
            },
          }),
        ),
      );

      const result = await fetchTokenPrice("coingecko", "test-token");
      expect(result.source).toBe("coingecko");
      expect(result.priceUsd).toBe(100);
    });

    test("works with CoinMarketCap source", async () => {
      global.fetch = mock(() =>
        Promise.resolve(
          createMockResponse({
            data: {
              // CMC returns an array per symbol key
              BTC: [
                {
                  id: 1,
                  symbol: "BTC",
                  name: "Bitcoin",
                  quote: {
                    USD: {
                      price: 50000,
                      percent_change_24h: 2.5,
                      volume_24h: 1000000,
                      market_cap: 1000000000,
                      last_updated: new Date().toISOString(),
                    },
                  },
                },
              ],
            },
          }),
        ),
      );

      const result = await fetchTokenPrice("coinmarketcap", "btc");
      expect(result.source).toBe("coinmarketcap");
      expect(result.priceUsd).toBe(50000);
    });
  });

  describe("fetchTrendingTokens", () => {
    test("respects limit parameter", async () => {
      const tokens = Array.from({ length: 50 }, (_, i) => ({
        address: `token${i}`,
        symbol: `TKN${i}`,
        name: `Token ${i}`,
        decimals: 9,
        price: i * 10,
        priceChange24hPercent: i,
        v24hUSD: i * 1000,
        rank: i + 1,
        logoURI: "",
      }));

      global.fetch = mock(() =>
        Promise.resolve(
          createMockResponse({ success: true, data: { items: tokens } }),
        ),
      );

      const result = await fetchTrendingTokens("birdeye", 5);
      expect(result.tokens).toHaveLength(5);
      expect(result.tokens[0].rank).toBe(1);
      expect(result.tokens[4].rank).toBe(5);
    });

    test("handles empty results", async () => {
      global.fetch = mock(() =>
        Promise.resolve(
          createMockResponse({ success: true, data: { items: [] } }),
        ),
      );

      const result = await fetchTrendingTokens("birdeye", 20);
      expect(result.tokens).toHaveLength(0);
    });

    test("handles limit larger than available tokens", async () => {
      global.fetch = mock(() =>
        Promise.resolve(
          createMockResponse({
            success: true,
            data: {
              items: [
                {
                  address: "only-one",
                  symbol: "ONE",
                  name: "Only One",
                  decimals: 9,
                  price: 1,
                  priceChange24hPercent: 0,
                  v24hUSD: 0,
                  rank: 1,
                  logoURI: "",
                },
              ],
            },
          }),
        ),
      );

      const result = await fetchTrendingTokens("birdeye", 100);
      expect(result.tokens).toHaveLength(1);
    });

    test("limit of 0 returns empty array", async () => {
      global.fetch = mock(() =>
        Promise.resolve(
          createMockResponse({
            success: true,
            data: {
              items: [
                {
                  address: "a",
                  symbol: "A",
                  name: "A",
                  decimals: 9,
                  price: 1,
                  priceChange24hPercent: 0,
                  v24hUSD: 0,
                  rank: 1,
                  logoURI: "",
                },
              ],
            },
          }),
        ),
      );

      const result = await fetchTrendingTokens("birdeye", 0);
      expect(result.tokens).toHaveLength(0);
    });

    test("throws on unsupported source", async () => {
      await expect(fetchTrendingTokens("invalid" as "birdeye")).rejects.toThrow(
        "Unsupported source",
      );
    });
  });

  describe("fetchMarketOverview", () => {
    test("transforms CoinGecko global data correctly", async () => {
      global.fetch = mock(() =>
        Promise.resolve(
          createMockResponse({
            data: {
              active_cryptocurrencies: 15000,
              total_market_cap: { usd: 2500000000000 },
              total_volume: { usd: 150000000000 },
              market_cap_percentage: { btc: 52.1, eth: 17.3 },
              updated_at: 1700000000,
            },
          }),
        ),
      );

      const result = await fetchMarketOverview("coingecko");

      expect(result.source).toBe("coingecko");
      expect(result.totalMarketCapUsd).toBe(2500000000000);
      expect(result.totalVolume24hUsd).toBe(150000000000);
      expect(result.btcDominance).toBe(52.1);
      expect(result.ethDominance).toBe(17.3);
      expect(result.activeCoins).toBe(15000);
    });

    test("handles extreme values", async () => {
      global.fetch = mock(() =>
        Promise.resolve(
          createMockResponse({
            data: {
              active_cryptocurrencies: 0,
              total_market_cap: { usd: 0 },
              total_volume: { usd: 0 },
              market_cap_percentage: { btc: 100, eth: 0 },
              updated_at: 0,
            },
          }),
        ),
      );

      const result = await fetchMarketOverview("coingecko");
      expect(result.totalMarketCapUsd).toBe(0);
      expect(result.btcDominance).toBe(100);
    });
  });

  describe("fetchSolanaWalletPortfolio", () => {
    test("handles wallet with no holdings", async () => {
      global.fetch = mock(() =>
        Promise.resolve(
          createMockResponse({
            success: true,
            data: { wallet: "empty-wallet", totalUsd: 0, items: [] },
          }),
        ),
      );

      const result = await fetchSolanaWalletPortfolio("empty-wallet");
      expect(result.totalValueUsd).toBe(0);
      expect(result.holdings).toHaveLength(0);
    });

    test("calculates percentages correctly", async () => {
      global.fetch = mock(() =>
        Promise.resolve(
          createMockResponse({
            success: true,
            data: {
              wallet: "test-wallet",
              totalUsd: 1000,
              items: [
                {
                  address: "t1",
                  symbol: "SOL",
                  name: "Solana",
                  decimals: 9,
                  uiAmount: 5,
                  valueUsd: 500,
                  priceUsd: 100,
                  logoURI: "",
                  chainId: "solana",
                },
                {
                  address: "t2",
                  symbol: "USDC",
                  name: "USD Coin",
                  decimals: 6,
                  uiAmount: 500,
                  valueUsd: 500,
                  priceUsd: 1,
                  logoURI: "",
                  chainId: "solana",
                },
              ],
            },
          }),
        ),
      );

      const result = await fetchSolanaWalletPortfolio("test-wallet");
      expect(result.holdings[0].percentage).toBe(50);
      expect(result.holdings[1].percentage).toBe(50);
    });
  });

  describe("fetchJupiterQuote", () => {
    test("handles multi-hop routes", async () => {
      global.fetch = mock((url) => {
        const urlStr = url as string;
        if (urlStr.includes("/quote")) {
          return Promise.resolve(
            createMockResponse({
              inputMint: "SOL",
              outputMint: "USDC",
              inAmount: "1000000000",
              outAmount: "100000000",
              priceImpactPct: "0.05",
              routePlan: [
                {
                  swapInfo: {
                    ammKey: "a1",
                    label: "Raydium",
                    inputMint: "SOL",
                    outputMint: "USDT",
                    inAmount: "500",
                    outAmount: "50",
                    feeAmount: "1",
                    feeMint: "SOL",
                  },
                  percent: 50,
                },
                {
                  swapInfo: {
                    ammKey: "a2",
                    label: "Orca",
                    inputMint: "SOL",
                    outputMint: "USDC",
                    inAmount: "500",
                    outAmount: "50",
                    feeAmount: "1",
                    feeMint: "SOL",
                  },
                  percent: 50,
                },
              ],
            }),
          );
        }
        // Token list response
        return Promise.resolve(
          createMockResponse([
            { address: "SOL", symbol: "SOL", name: "Solana", decimals: 9 },
            { address: "USDC", symbol: "USDC", name: "USD Coin", decimals: 6 },
          ]),
        );
      });

      const result = await fetchJupiterQuote({
        inputMint: "SOL",
        outputMint: "USDC",
        amount: "1000000000",
        slippageBps: 100,
      });

      expect(result.routes).toHaveLength(2);
      expect(result.routes[0].protocol).toBe("Raydium");
      expect(result.routes[1].protocol).toBe("Orca");
      // Portion is normalized to 0-1 range in the service
      expect(result.routes[0].portion).toBeGreaterThan(0);
    });

    test("returns correct input/output tokens", async () => {
      global.fetch = mock((url) => {
        const urlStr = url as string;
        if (urlStr.includes("/quote")) {
          return Promise.resolve(
            createMockResponse({
              inputMint: "SOL",
              outputMint: "USDC",
              inAmount: "1000000000",
              outAmount: "100000000",
              priceImpactPct: "0.01",
              routePlan: [],
            }),
          );
        }
        return Promise.resolve(
          createMockResponse([
            { address: "SOL", symbol: "SOL", name: "Solana", decimals: 9 },
            { address: "USDC", symbol: "USDC", name: "USD Coin", decimals: 6 },
          ]),
        );
      });

      const result = await fetchJupiterQuote({
        inputMint: "SOL",
        outputMint: "USDC",
        amount: "1000000000",
      });

      expect(result.inputAmount).toBe("1000000000");
      expect(result.outputAmount).toBe("100000000");
    });
  });

  describe("fetchHeliusTransactions", () => {
    test("handles wallet with no transactions", async () => {
      global.fetch = mock(() => Promise.resolve(createMockResponse([])));

      const result = await fetchHeliusTransactions("new-wallet", 20);
      expect(result.transactions).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });

    test("parses transaction data correctly", async () => {
      const txs = [
        {
          signature: "sig1",
          timestamp: 1700000000,
          type: "TRANSFER",
          nativeTransfers: [
            { fromUserAccount: "from1", toUserAccount: "to1", amount: 1000 },
          ],
          tokenTransfers: [
            {
              mint: "token1",
              fromUserAccount: "from1",
              toUserAccount: "to1",
              tokenAmount: 100,
            },
          ],
        },
        {
          signature: "sig2",
          timestamp: 1700000060,
          type: "SWAP",
          nativeTransfers: [],
          tokenTransfers: [
            {
              mint: "token2",
              fromUserAccount: "from2",
              toUserAccount: "to2",
              tokenAmount: 200,
            },
          ],
        },
      ];

      global.fetch = mock(() => Promise.resolve(createMockResponse(txs)));

      const result = await fetchHeliusTransactions("wallet", 10);
      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[0].signature).toBe("sig1");
      expect(result.transactions[1].signature).toBe("sig2");
    });
  });

  describe("fetchOHLCV", () => {
    test("limits output to 100 candles", async () => {
      const candles = Array.from({ length: 500 }, (_, i) => ({
        unixTime: i * 3600,
        o: 100 + i,
        h: 110 + i,
        l: 90 + i,
        c: 105 + i,
        v: 1000 * i,
      }));

      global.fetch = mock(() =>
        Promise.resolve(
          createMockResponse({ success: true, data: { items: candles } }),
        ),
      );

      const result = await fetchOHLCV("birdeye", "token", { interval: "1H" });
      expect(result.candles).toHaveLength(100);
      // Should be the LAST 100 candles (most recent)
      expect(result.candles[99].timestamp).toBe(candles[499].unixTime);
    });

    test("handles empty candle data", async () => {
      global.fetch = mock(() =>
        Promise.resolve(
          createMockResponse({ success: true, data: { items: [] } }),
        ),
      );

      const result = await fetchOHLCV("birdeye", "token");
      expect(result.candles).toHaveLength(0);
    });

    test("preserves OHLCV data integrity", async () => {
      const mockCandle = {
        unixTime: 1700000000,
        o: 100.5,
        h: 110.25,
        l: 95.75,
        c: 105.5,
        v: 1234567.89,
      };
      global.fetch = mock(() =>
        Promise.resolve(
          createMockResponse({ success: true, data: { items: [mockCandle] } }),
        ),
      );

      const result = await fetchOHLCV("birdeye", "token");
      expect(result.candles[0]).toEqual({
        timestamp: 1700000000,
        open: 100.5,
        high: 110.25,
        low: 95.75,
        close: 105.5,
        volume: 1234567.89,
      });
    });
  });

  describe("searchTokens", () => {
    test("handles empty search results", async () => {
      global.fetch = mock(() =>
        Promise.resolve(createMockResponse({ coins: [] })),
      );

      const result = await searchTokens("coingecko", "xyznonexistent123", 20);
      expect(result.tokens).toHaveLength(0);
    });

    test("respects limit for CoinGecko (client-side slicing)", async () => {
      const coins = Array.from({ length: 50 }, (_, i) => ({
        id: `coin${i}`,
        name: `Coin ${i}`,
        symbol: `C${i}`,
        market_cap_rank: i + 1,
      }));

      global.fetch = mock(() => Promise.resolve(createMockResponse({ coins })));

      const result = await searchTokens("coingecko", "coin", 5);
      expect(result.tokens).toHaveLength(5);
    });
  });

  describe("checkServicesHealth", () => {
    test("returns healthy when all services respond", async () => {
      global.fetch = mock(() =>
        Promise.resolve(createMockResponse({ success: true, data: {} })),
      );

      const result = await checkServicesHealth();

      expect(result.status).toBe("healthy");
      expect(result.summary.total).toBe(7);
      expect(result.summary.healthy).toBe(7);
      expect(result.summary.unhealthy).toBe(0);
    });

    test("returns degraded when some services fail", async () => {
      let callCount = 0;
      global.fetch = mock(() => {
        callCount++;
        // First 3 calls succeed, rest fail
        if (callCount <= 3) {
          return Promise.resolve(createMockResponse({ success: true }));
        }
        return Promise.reject(new Error("Service unavailable"));
      });

      const result = await checkServicesHealth();

      expect(result.status).toBe("degraded");
      expect(result.summary.healthy).toBeGreaterThan(0);
      expect(result.summary.unhealthy).toBeGreaterThan(0);
    });

    test("returns down when all services fail", async () => {
      global.fetch = mock(() => Promise.reject(new Error("Network error")));

      const result = await checkServicesHealth();

      expect(result.status).toBe("down");
      expect(result.summary.healthy).toBe(0);
      expect(result.summary.unhealthy).toBe(7);
    });

    test("filters by service names", async () => {
      global.fetch = mock(() =>
        Promise.resolve(createMockResponse({ success: true })),
      );

      const result = await checkServicesHealth(["birdeye", "jupiter"]);

      expect(result.summary.total).toBe(2);
      expect(Object.keys(result.services)).toContain("birdeye");
      expect(Object.keys(result.services)).toContain("jupiter");
      expect(Object.keys(result.services)).not.toContain("coingecko");
    });

    test("handles empty service list", async () => {
      const result = await checkServicesHealth([]);

      expect(result.status).toBe("healthy"); // 0/0 = healthy
      expect(result.summary.total).toBe(0);
    });

    test("reports latency for each service", async () => {
      global.fetch = mock(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () => resolve(createMockResponse({ success: true })),
              10,
            ),
          ),
      );

      const result = await checkServicesHealth(["birdeye"]);

      expect(result.services.birdeye.latencyMs).toBeGreaterThanOrEqual(0);
    });

    test("marks failed services as unhealthy", async () => {
      global.fetch = mock(() => Promise.reject(new Error("Failed")));

      const result = await checkServicesHealth(["birdeye"]);

      expect(result.services.birdeye.healthy).toBe(false);
      // Latency is recorded even for failures (time until failure)
      expect(typeof result.services.birdeye.latencyMs).toBe("number");
    });
  });

  describe("Concurrent Behavior", () => {
    test("handles multiple simultaneous price requests", async () => {
      let callCount = 0;
      global.fetch = mock(() => {
        callCount++;
        return Promise.resolve(
          createMockResponse({
            success: true,
            data: { value: callCount * 100, updateUnixTime: Date.now() / 1000 },
          }),
        );
      });

      const results = await Promise.all([
        fetchTokenPrice("birdeye", "token1"),
        fetchTokenPrice("birdeye", "token2"),
        fetchTokenPrice("birdeye", "token3"),
      ]);

      expect(results).toHaveLength(3);
      // Each should have a different price based on call order
      const prices = results.map((r) => r.priceUsd);
      expect(new Set(prices).size).toBe(3); // All unique
    });

    test("health check runs all services concurrently", async () => {
      const callTimes: number[] = [];
      const startTime = Date.now();

      global.fetch = mock(async () => {
        callTimes.push(Date.now() - startTime);
        await new Promise((r) => setTimeout(r, 50)); // Simulate latency
        return createMockResponse({ success: true });
      });

      await checkServicesHealth();

      // All calls should start within a short window (concurrent, not sequential)
      const firstCall = Math.min(...callTimes);
      const lastCall = Math.max(...callTimes);
      expect(lastCall - firstCall).toBeLessThan(50); // All started within 50ms
    });
  });

  describe("Error Handling", () => {
    test(
      "handles network timeout",
      async () => {
        global.fetch = mock(
          () =>
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Request timed out")), 10),
            ),
        );

        await expect(fetchTokenPrice("birdeye", "token")).rejects.toThrow();
      },
      { timeout: 15000 },
    ); // Service has internal retry logic that can take time

    test("handles malformed JSON response", async () => {
      global.fetch = mock(() => ({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.reject(new SyntaxError("Unexpected token")),
        text: () => Promise.resolve("not json"),
      }));

      await expect(fetchTokenPrice("birdeye", "token")).rejects.toThrow();
    });

    test("handles rate limiting (429)", async () => {
      let attempts = 0;
      global.fetch = mock(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.resolve(
            createMockResponse({ error: "Rate limited" }, 429, {
              "retry-after": "1",
            }),
          );
        }
        return Promise.resolve(
          createMockResponse({
            success: true,
            data: { value: 100, updateUnixTime: Date.now() / 1000 },
          }),
        );
      });

      // Should eventually succeed after retries
      const result = await fetchTokenPrice("birdeye", "token");
      expect(result.priceUsd).toBe(100);
      expect(attempts).toBe(3);
    });

    test("handles 500 server errors with retry", async () => {
      let attempts = 0;
      global.fetch = mock(() => {
        attempts++;
        if (attempts < 2) {
          return Promise.resolve(
            createMockResponse({ error: "Server error" }, 500),
          );
        }
        return Promise.resolve(
          createMockResponse({
            success: true,
            data: { value: 100, updateUnixTime: Date.now() / 1000 },
          }),
        );
      });

      const result = await fetchTokenPrice("birdeye", "token");
      expect(result.priceUsd).toBe(100);
    });

    test("handles 400 client errors without retry", async () => {
      let attempts = 0;
      global.fetch = mock(() => {
        attempts++;
        return Promise.resolve(
          createMockResponse({ error: "Bad request" }, 400),
        );
      });

      await expect(fetchTokenPrice("birdeye", "token")).rejects.toThrow();
      expect(attempts).toBe(1); // No retries for client errors
    });
  });

  describe("Data Validation", () => {
    test("fetchTokenPrice returns ISO timestamp", async () => {
      global.fetch = mock(() =>
        Promise.resolve(
          createMockResponse({
            success: true,
            data: { value: 100, updateUnixTime: 1700000000 },
          }),
        ),
      );

      const result = await fetchTokenPrice("birdeye", "token");

      // Verify it's a valid ISO string
      const parsed = new Date(result.lastUpdated);
      expect(parsed.getTime()).toBeGreaterThan(0);
      expect(result.lastUpdated).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      );
    });

    test("fetchTrendingTokens preserves token ranking order", async () => {
      const tokens = [
        {
          address: "third",
          symbol: "C",
          name: "Third",
          decimals: 9,
          price: 1,
          priceChange24hPercent: 0,
          v24hUSD: 0,
          rank: 3,
          logoURI: "",
        },
        {
          address: "first",
          symbol: "A",
          name: "First",
          decimals: 9,
          price: 1,
          priceChange24hPercent: 0,
          v24hUSD: 0,
          rank: 1,
          logoURI: "",
        },
        {
          address: "second",
          symbol: "B",
          name: "Second",
          decimals: 9,
          price: 1,
          priceChange24hPercent: 0,
          v24hUSD: 0,
          rank: 2,
          logoURI: "",
        },
      ];

      global.fetch = mock(() =>
        Promise.resolve(
          createMockResponse({ success: true, data: { items: tokens } }),
        ),
      );

      const result = await fetchTrendingTokens("birdeye", 10);

      // Should preserve API order, not reorder
      expect(result.tokens[0].rank).toBe(3);
      expect(result.tokens[1].rank).toBe(1);
      expect(result.tokens[2].rank).toBe(2);
    });

    test("fetchSolanaTokenOverview maps all fields correctly", async () => {
      const mockOverview = {
        address: "token123",
        symbol: "TKN",
        name: "Test Token",
        decimals: 9,
        price: 1.5,
        priceChange24hPercent: 5.5,
        v24hUSD: 1000000,
        liquidity: 500000,
        mc: 10000000,
        holder: 5000,
      };

      global.fetch = mock(() =>
        Promise.resolve(
          createMockResponse({ success: true, data: mockOverview }),
        ),
      );

      const result = await fetchSolanaTokenOverview("token123");

      expect(result).toEqual({
        address: "token123",
        symbol: "TKN",
        name: "Test Token",
        decimals: 9,
        price: 1.5,
        priceChange24h: 5.5,
        volume24h: 1000000,
        liquidity: 500000,
        marketCap: 10000000,
        holders: 5000,
      });
    });
  });
});

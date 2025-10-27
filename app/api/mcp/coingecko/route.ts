import { createPaidMcpHandler } from "x402-mcp";
import z from "zod";
import { facilitator } from "@coinbase/x402";
import { getOrCreateSellerAccount, env } from "@/lib/accounts";
import type { Account } from "viem/accounts";

// CoinGecko API setup
const COINGECKO_API_BASE = "https://pro-api.coingecko.com/api/v3";
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY || "";

async function fetchCoinGeckoAPI(
  endpoint: string,
  params?: Record<string, string>
) {
  const url = new URL(`${COINGECKO_API_BASE}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
  }

  const response = await fetch(url.toString(), {
    headers: {
      "x-cg-pro-api-key": COINGECKO_API_KEY,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`CoinGecko API error: ${response.status} - ${error}`);
  }

  return response.json();
}

let cachedHandler: ((request: Request) => Promise<Response>) | null = null;
let sellerAccountPromise: Promise<Account> | null = null;

async function getHandler() {
  if (cachedHandler) {
    return cachedHandler;
  }

  if (!sellerAccountPromise) {
    sellerAccountPromise = getOrCreateSellerAccount();
  }
  const sellerAccount = await sellerAccountPromise;

  cachedHandler = createPaidMcpHandler(
    (server) => {
      // Tool 1: Get Coin Price
      server.paidTool(
        "get_coin_price",
        "Get current price and market data for a cryptocurrency. Pay $0.02 to fetch real-time price, market cap, volume, and 24h change for any coin.",
        { price: 0.02 },
        {
          coin_id: z
            .string()
            .describe(
              "CoinGecko coin ID (e.g., 'bitcoin', 'ethereum', 'solana')"
            ) as any,
          vs_currency: z
            .string()
            .optional()
            .describe("Currency for price (default: 'usd')") as any,
          include_24hr_change: z
            .boolean()
            .optional()
            .describe("Include 24h price change (default: true)") as any,
          include_market_cap: z
            .boolean()
            .optional()
            .describe("Include market cap (default: true)") as any,
        },
        {},
        async (args) => {
          try {
            const {
              coin_id,
              vs_currency = "usd",
              include_24hr_change = true,
              include_market_cap = true,
            } = args as {
              coin_id: string;
              vs_currency?: string;
              include_24hr_change?: boolean;
              include_market_cap?: boolean;
            };

            if (!coin_id) {
              throw new Error("coin_id is required");
            }

            const data = await fetchCoinGeckoAPI(`/coins/${coin_id}`, {
              localization: "false",
              tickers: "false",
              community_data: "false",
              developer_data: "false",
            });

            const result = {
              id: data.id,
              symbol: data.symbol.toUpperCase(),
              name: data.name,
              current_price: data.market_data.current_price[vs_currency],
              ...(include_market_cap && {
                market_cap: data.market_data.market_cap[vs_currency],
                market_cap_rank: data.market_cap_rank,
              }),
              ...(include_24hr_change && {
                price_change_24h: data.market_data.price_change_24h,
                price_change_percentage_24h:
                  data.market_data.price_change_percentage_24h,
              }),
              total_volume: data.market_data.total_volume[vs_currency],
              high_24h: data.market_data.high_24h[vs_currency],
              low_24h: data.market_data.low_24h[vs_currency],
              circulating_supply: data.market_data.circulating_supply,
              total_supply: data.market_data.total_supply,
              last_updated: data.last_updated,
            };

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          } catch (error: any) {
            console.error("CoinGecko price error:", error);
            return {
              content: [
                {
                  type: "text",
                  text: `Failed to get coin price: ${error.message || "Unknown error"}`,
                },
              ],
              isError: true,
            };
          }
        }
      );

      // Tool 2: Get Market Chart
      server.paidTool(
        "get_market_chart",
        "Get historical price chart data for a cryptocurrency. Pay $0.05 to fetch price history with customizable time range (1h to 1 year).",
        { price: 0.05 },
        {
          coin_id: z
            .string()
            .describe(
              "CoinGecko coin ID (e.g., 'bitcoin', 'ethereum', 'solana')"
            ) as any,
          vs_currency: z
            .string()
            .optional()
            .describe("Currency for price (default: 'usd')") as any,
          days: z
            .enum(["1", "7", "14", "30", "90", "180", "365", "max"])
            .optional()
            .describe(
              "Number of days to fetch (1, 7, 14, 30, 90, 180, 365, max) (default: '7')"
            ) as any,
        },
        {},
        async (args) => {
          try {
            const {
              coin_id,
              vs_currency = "usd",
              days = "7",
            } = args as {
              coin_id: string;
              vs_currency?: string;
              days?: string;
            };

            if (!coin_id) {
              throw new Error("coin_id is required");
            }

            const data = await fetchCoinGeckoAPI(
              `/coins/${coin_id}/market_chart`,
              {
                vs_currency: vs_currency,
                days: days,
              }
            );

            // Sample data to reduce size (take every nth point)
            const sampleRate = Math.max(
              1,
              Math.floor(data.prices.length / 100)
            );
            const sampledPrices = data.prices.filter(
              (_: any, i: number) => i % sampleRate === 0
            );

            const result = {
              coin_id: coin_id,
              vs_currency: vs_currency,
              days: days,
              data_points: sampledPrices.length,
              prices: sampledPrices.map((p: [number, number]) => ({
                timestamp: new Date(p[0]).toISOString(),
                price: p[1],
              })),
              summary: {
                current_price: data.prices[data.prices.length - 1][1],
                start_price: data.prices[0][1],
                highest_price: Math.max(
                  ...data.prices.map((p: [number, number]) => p[1])
                ),
                lowest_price: Math.min(
                  ...data.prices.map((p: [number, number]) => p[1])
                ),
                change_percentage:
                  ((data.prices[data.prices.length - 1][1] -
                    data.prices[0][1]) /
                    data.prices[0][1]) *
                  100,
              },
            };

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          } catch (error: any) {
            console.error("CoinGecko market chart error:", error);
            return {
              content: [
                {
                  type: "text",
                  text: `Failed to get market chart: ${error.message || "Unknown error"}`,
                },
              ],
              isError: true,
            };
          }
        }
      );

      // Tool 3: Get Trending Coins
      server.paidTool(
        "get_trending_coins",
        "Get top trending cryptocurrencies on CoinGecko. Pay $0.03 to fetch the hottest coins based on search volume and market activity.",
        { price: 0.03 },
        {},
        {},
        async () => {
          try {
            const data = await fetchCoinGeckoAPI("/search/trending");

            const trending = data.coins.map((item: any) => ({
              id: item.item.id,
              coin_id: item.item.coin_id,
              name: item.item.name,
              symbol: item.item.symbol,
              market_cap_rank: item.item.market_cap_rank,
              thumb: item.item.thumb,
              price_btc: item.item.price_btc,
              score: item.item.score,
            }));

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      trending_coins: trending,
                      timestamp: new Date().toISOString(),
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          } catch (error: any) {
            console.error("CoinGecko trending error:", error);
            return {
              content: [
                {
                  type: "text",
                  text: `Failed to get trending coins: ${error.message || "Unknown error"}`,
                },
              ],
              isError: true,
            };
          }
        }
      );

      // Tool 4: Search Coins
      server.paidTool(
        "search_coins",
        "Search for cryptocurrencies by name or symbol. Pay $0.01 to search CoinGecko's database of 10,000+ coins.",
        { price: 0.01 },
        {
          query: z.string().describe("Search query (name or symbol)") as any,
        },
        {},
        async (args) => {
          try {
            const { query } = args as { query: string };

            if (!query) {
              throw new Error("query is required");
            }

            const data = await fetchCoinGeckoAPI("/search", {
              query: query,
            });

            const results = {
              coins: data.coins.slice(0, 10).map((coin: any) => ({
                id: coin.id,
                name: coin.name,
                symbol: coin.symbol,
                market_cap_rank: coin.market_cap_rank,
                thumb: coin.thumb,
              })),
              total_results: data.coins.length,
            };

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(results, null, 2),
                },
              ],
            };
          } catch (error: any) {
            console.error("CoinGecko search error:", error);
            return {
              content: [
                {
                  type: "text",
                  text: `Failed to search coins: ${error.message || "Unknown error"}`,
                },
              ],
              isError: true,
            };
          }
        }
      );

      // Tool 5: Get Global Market Data
      server.paidTool(
        "get_global_market_data",
        "Get global cryptocurrency market statistics. Pay $0.02 to fetch total market cap, volume, BTC dominance, and active coins/exchanges.",
        { price: 0.02 },
        {},
        {},
        async () => {
          try {
            const data = await fetchCoinGeckoAPI("/global");

            const result = {
              active_cryptocurrencies: data.data.active_cryptocurrencies,
              markets: data.data.markets,
              total_market_cap: data.data.total_market_cap,
              total_volume: data.data.total_volume,
              market_cap_percentage: data.data.market_cap_percentage,
              market_cap_change_percentage_24h_usd:
                data.data.market_cap_change_percentage_24h_usd,
              updated_at: new Date(data.data.updated_at * 1000).toISOString(),
            };

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          } catch (error: any) {
            console.error("CoinGecko global data error:", error);
            return {
              content: [
                {
                  type: "text",
                  text: `Failed to get global market data: ${error.message || "Unknown error"}`,
                },
              ],
              isError: true,
            };
          }
        }
      );
    },
    {
      serverInfo: {
        name: "coingecko-crypto-api",
        version: "1.0.0",
      },
    },
    {
      recipient: sellerAccount.address,
      facilitator,
      network: env.NETWORK,
    }
  );

  return cachedHandler;
}

export async function GET(request: Request) {
  const handler = await getHandler();
  return handler(request);
}

export async function POST(request: Request) {
  const handler = await getHandler();
  return handler(request);
}

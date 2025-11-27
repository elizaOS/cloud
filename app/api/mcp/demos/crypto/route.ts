import { createMcpHandler } from "mcp-handler";
import { z } from "zod3";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const maxDuration = 30;

// Mock crypto data for demo purposes
// In production, integrate with CoinGecko, CoinMarketCap, or similar APIs
const mockCryptoData: Record<string, {
  name: string;
  symbol: string;
  price: number;
  change24h: number;
  marketCap: number;
  volume24h: number;
  circulatingSupply: number;
  ath: number;
  chains: string[];
}> = {
  bitcoin: {
    name: "Bitcoin",
    symbol: "BTC",
    price: 67432.18,
    change24h: 2.34,
    marketCap: 1327000000000,
    volume24h: 28400000000,
    circulatingSupply: 19678543,
    ath: 73750,
    chains: ["bitcoin"],
  },
  ethereum: {
    name: "Ethereum",
    symbol: "ETH",
    price: 3521.87,
    change24h: 1.89,
    marketCap: 423000000000,
    volume24h: 15200000000,
    circulatingSupply: 120145321,
    ath: 4878,
    chains: ["ethereum", "arbitrum", "optimism", "base", "polygon"],
  },
  solana: {
    name: "Solana",
    symbol: "SOL",
    price: 178.43,
    change24h: -0.78,
    marketCap: 82000000000,
    volume24h: 3100000000,
    circulatingSupply: 459876234,
    ath: 260,
    chains: ["solana"],
  },
  usdc: {
    name: "USD Coin",
    symbol: "USDC",
    price: 1.0,
    change24h: 0.01,
    marketCap: 34000000000,
    volume24h: 7800000000,
    circulatingSupply: 34000000000,
    ath: 1.02,
    chains: ["ethereum", "solana", "base", "arbitrum", "polygon", "avalanche"],
  },
  eliza: {
    name: "ai16z",
    symbol: "AI16Z",
    price: 0.8234,
    change24h: 12.45,
    marketCap: 823400000,
    volume24h: 156000000,
    circulatingSupply: 1000000000,
    ath: 2.47,
    chains: ["solana"],
  },
};

// Mock historical data generator
function generateHistoricalData(basePrice: number, days: number) {
  const data = [];
  let price = basePrice * 0.9; // Start 10% lower
  
  for (let i = days; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    
    // Random walk with trend
    const change = (Math.random() - 0.48) * (basePrice * 0.02);
    price = Math.max(price + change, basePrice * 0.5);
    
    data.push({
      date: date.toISOString().split("T")[0],
      price: Math.round(price * 100) / 100,
      volume: Math.round(Math.random() * 1000000000),
    });
  }
  
  return data;
}

// Create MCP handler for Crypto utilities
const mcpHandler = createMcpHandler(
  (server) => {
    // Tool 1: Get Current Price
    server.tool(
      "get_crypto_price",
      "Get the current price and basic info for a cryptocurrency. x402 payment: $0.0005 per request.",
      {
        token: z
          .string()
          .describe("Token name or symbol (e.g., 'bitcoin', 'ETH', 'solana')"),
        currency: z
          .enum(["usd", "eur", "gbp", "jpy"])
          .optional()
          .default("usd")
          .describe("Fiat currency for price"),
      },
      async ({ token, currency = "usd" }) => {
        try {
          const tokenKey = token.toLowerCase();
          const crypto = mockCryptoData[tokenKey] || 
            Object.values(mockCryptoData).find(
              (c) => c.symbol.toLowerCase() === tokenKey
            );
          
          if (!crypto) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: `Token '${token}' not found`,
                    suggestion: "Try: bitcoin, ethereum, solana, usdc, eliza",
                  }, null, 2),
                },
              ],
              isError: true,
            };
          }

          // Simple currency conversion (mock rates)
          const rates: Record<string, number> = {
            usd: 1,
            eur: 0.92,
            gbp: 0.79,
            jpy: 149.5,
          };
          
          const convertedPrice = crypto.price * rates[currency];
          const currencySymbol: Record<string, string> = {
            usd: "$",
            eur: "€",
            gbp: "£",
            jpy: "¥",
          };

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  name: crypto.name,
                  symbol: crypto.symbol,
                  price: {
                    value: Math.round(convertedPrice * 100) / 100,
                    currency: currency.toUpperCase(),
                    formatted: `${currencySymbol[currency]}${convertedPrice.toLocaleString()}`,
                  },
                  change24h: `${crypto.change24h > 0 ? "+" : ""}${crypto.change24h}%`,
                  marketCapRank: Object.keys(mockCryptoData).indexOf(tokenKey) + 1,
                  updatedAt: new Date().toISOString(),
                  x402: {
                    charged: true,
                    amount: "$0.0005",
                  },
                }, null, 2),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: error instanceof Error ? error.message : "Failed to get price",
                }, null, 2),
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Tool 2: Get Market Data
    server.tool(
      "get_market_data",
      "Get detailed market data including market cap, volume, and supply. x402 payment: $0.0005 per request.",
      {
        token: z.string().describe("Token name or symbol"),
      },
      async ({ token }) => {
        try {
          const tokenKey = token.toLowerCase();
          const crypto = mockCryptoData[tokenKey] || 
            Object.values(mockCryptoData).find(
              (c) => c.symbol.toLowerCase() === tokenKey
            );
          
          if (!crypto) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: `Token '${token}' not found`,
                  }, null, 2),
                },
              ],
              isError: true,
            };
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  name: crypto.name,
                  symbol: crypto.symbol,
                  market: {
                    cap: {
                      value: crypto.marketCap,
                      formatted: `$${(crypto.marketCap / 1e9).toFixed(2)}B`,
                    },
                    volume24h: {
                      value: crypto.volume24h,
                      formatted: `$${(crypto.volume24h / 1e9).toFixed(2)}B`,
                    },
                    circulatingSupply: crypto.circulatingSupply.toLocaleString(),
                    fullyDilutedValuation: `$${((crypto.price * crypto.circulatingSupply * 1.2) / 1e9).toFixed(2)}B`,
                  },
                  performance: {
                    allTimeHigh: `$${crypto.ath.toLocaleString()}`,
                    athDistance: `${(((crypto.ath - crypto.price) / crypto.ath) * 100).toFixed(1)}% below ATH`,
                    change24h: `${crypto.change24h > 0 ? "+" : ""}${crypto.change24h}%`,
                  },
                  x402: { charged: true, amount: "$0.0005" },
                }, null, 2),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: error instanceof Error ? error.message : "Failed to get market data",
                }, null, 2),
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Tool 3: Get Price History
    server.tool(
      "get_price_history",
      "Get historical price data for a cryptocurrency. x402 payment: $0.0005 per request.",
      {
        token: z.string().describe("Token name or symbol"),
        days: z
          .number()
          .int()
          .min(1)
          .max(365)
          .optional()
          .default(30)
          .describe("Number of days of history"),
      },
      async ({ token, days = 30 }) => {
        try {
          const tokenKey = token.toLowerCase();
          const crypto = mockCryptoData[tokenKey] || 
            Object.values(mockCryptoData).find(
              (c) => c.symbol.toLowerCase() === tokenKey
            );
          
          if (!crypto) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: `Token '${token}' not found`,
                  }, null, 2),
                },
              ],
              isError: true,
            };
          }

          const history = generateHistoricalData(crypto.price, days);
          
          // Calculate summary stats
          const prices = history.map((h) => h.price);
          const high = Math.max(...prices);
          const low = Math.min(...prices);
          const avg = prices.reduce((a, b) => a + b, 0) / prices.length;

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  token: crypto.symbol,
                  period: `${days} days`,
                  summary: {
                    high: `$${high.toLocaleString()}`,
                    low: `$${low.toLocaleString()}`,
                    average: `$${avg.toFixed(2)}`,
                    change: `${(((history[history.length - 1].price - history[0].price) / history[0].price) * 100).toFixed(2)}%`,
                  },
                  history: history.slice(-7), // Return last 7 days for brevity
                  fullDataPoints: history.length,
                  x402: { charged: true, amount: "$0.0005" },
                }, null, 2),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: error instanceof Error ? error.message : "Failed to get history",
                }, null, 2),
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Tool 4: Get Token Info
    server.tool(
      "get_token_info",
      "Get detailed information about a token including supported chains. x402 payment: $0.0005 per request.",
      {
        token: z.string().describe("Token name or symbol"),
      },
      async ({ token }) => {
        try {
          const tokenKey = token.toLowerCase();
          const crypto = mockCryptoData[tokenKey] || 
            Object.values(mockCryptoData).find(
              (c) => c.symbol.toLowerCase() === tokenKey
            );
          
          if (!crypto) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: `Token '${token}' not found`,
                  }, null, 2),
                },
              ],
              isError: true,
            };
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  name: crypto.name,
                  symbol: crypto.symbol,
                  chains: crypto.chains,
                  multiChain: crypto.chains.length > 1,
                  primaryChain: crypto.chains[0],
                  info: {
                    description: `${crypto.name} (${crypto.symbol}) is available on ${crypto.chains.length} blockchain(s).`,
                    type: crypto.symbol === "USDC" ? "Stablecoin" : "Cryptocurrency",
                  },
                  x402: { charged: true, amount: "$0.0005" },
                }, null, 2),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: error instanceof Error ? error.message : "Failed to get token info",
                }, null, 2),
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Tool 5: Get Top Tokens
    server.tool(
      "get_top_tokens",
      "Get a list of top cryptocurrencies by market cap. x402 payment: $0.0005 per request.",
      {
        limit: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .default(5)
          .describe("Number of tokens to return"),
      },
      async ({ limit = 5 }) => {
        try {
          const sorted = Object.values(mockCryptoData)
            .sort((a, b) => b.marketCap - a.marketCap)
            .slice(0, limit);

          const topTokens = sorted.map((crypto, index) => ({
            rank: index + 1,
            name: crypto.name,
            symbol: crypto.symbol,
            price: `$${crypto.price.toLocaleString()}`,
            marketCap: `$${(crypto.marketCap / 1e9).toFixed(2)}B`,
            change24h: `${crypto.change24h > 0 ? "+" : ""}${crypto.change24h}%`,
          }));

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  topTokens,
                  totalMarketCap: `$${(sorted.reduce((a, b) => a + b.marketCap, 0) / 1e12).toFixed(2)}T`,
                  updatedAt: new Date().toISOString(),
                  x402: { charged: true, amount: "$0.0005" },
                }, null, 2),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: error instanceof Error ? error.message : "Failed to get top tokens",
                }, null, 2),
              },
            ],
            isError: true,
          };
        }
      }
    );
  },
  {},
  { basePath: "/api/mcp/demos" }
);

// GET handler - return server info (no auth required)
export async function GET() {
  return NextResponse.json({
    name: "Crypto Price MCP",
    version: "1.0.0",
    description: "Real-time cryptocurrency prices, market data, and historical charts. Supports both credits and x402 micropayments.",
    transport: ["http", "sse"],
    tools: [
      { name: "get_crypto_price", description: "Get current price for a token", cost: "1 credit" },
      { name: "get_market_data", description: "Get market cap, volume, supply", cost: "2 credits" },
      { name: "get_price_history", description: "Get historical price data", cost: "3 credits" },
      { name: "get_token_info", description: "Get token details and chains", cost: "1 credit" },
      { name: "get_top_tokens", description: "Get top tokens by market cap", cost: "2 credits" },
    ],
    pricing: { 
      type: "credits",
      description: "1-3 credits per request",
      creditsPerRequest: "1-3",
      alternativePayment: {
        type: "x402",
        pricePerRequest: "$0.0005",
        network: "base",
        currency: "USDC",
      },
    },
    x402Enabled: true,
    supportedTokens: Object.keys(mockCryptoData),
    status: "live",
  });
}

// POST handler - handle MCP protocol
// In production, x402 payment verification would happen here
export async function POST(req: NextRequest) {
  return await mcpHandler(req as unknown as Request);
}


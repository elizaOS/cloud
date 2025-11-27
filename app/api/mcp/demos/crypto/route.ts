import { createPaidMcpHandler } from "x402-mcp";
import { z } from "zod3";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const maxDuration = 30;

// ============================================================================
// CoinGecko Pro API Client with Caching
// Uses Pro API when COINGECKO_API_KEY is set, falls back to free tier
// ============================================================================

const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY;
const COINGECKO_BASE = COINGECKO_API_KEY 
  ? "https://pro-api.coingecko.com/api/v3" 
  : "https://api.coingecko.com/api/v3";

// Simple in-memory cache with TTL
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
// Pro API has higher rate limits, so we can cache for shorter periods for fresher data
const CACHE_TTL = COINGECKO_API_KEY ? 30_000 : 60_000; // 30s for Pro, 60s for free

function getCached<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.data;
  }
  cache.delete(key);
  return null;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

// Common token ID mappings (CoinGecko uses specific IDs)
const TOKEN_ID_MAP: Record<string, string> = {
  btc: "bitcoin",
  eth: "ethereum",
  sol: "solana",
  usdc: "usd-coin",
  usdt: "tether",
  bnb: "binancecoin",
  xrp: "ripple",
  ada: "cardano",
  doge: "dogecoin",
  dot: "polkadot",
  matic: "matic-network",
  shib: "shiba-inu",
  avax: "avalanche-2",
  link: "chainlink",
  atom: "cosmos",
  uni: "uniswap",
  ltc: "litecoin",
  etc: "ethereum-classic",
  xlm: "stellar",
  near: "near",
  apt: "aptos",
  arb: "arbitrum",
  op: "optimism",
  sui: "sui",
  sei: "sei-network",
  inj: "injective-protocol",
  tia: "celestia",
  jup: "jupiter-exchange-solana",
  wif: "dogwifcoin",
  pepe: "pepe",
  bonk: "bonk",
  ai16z: "ai16z",
  elizaos: "elizaos",
};

function resolveTokenId(input: string): string {
  const lower = input.toLowerCase().trim();
  return TOKEN_ID_MAP[lower] || lower;
}

// Rate limiting helper - Pro API has much higher limits (500/min vs 10-50/min)
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = COINGECKO_API_KEY ? 150 : 1200; // 150ms for Pro, 1.2s for free

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
  }
  
  lastRequestTime = Date.now();
  
  // Build headers - add API key for Pro tier
  const headers: Record<string, string> = {
    "Accept": "application/json",
    "User-Agent": "ElizaCloud-MCP/2.0",
  };
  
  if (COINGECKO_API_KEY) {
    headers["x-cg-pro-api-key"] = COINGECKO_API_KEY;
  }
  
  const response = await fetch(url, { headers });
  
  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("Rate limited by CoinGecko. Please try again shortly.");
    }
    if (response.status === 401) {
      throw new Error("Invalid CoinGecko API key. Check your COINGECKO_API_KEY environment variable.");
    }
    throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
  }
  
  return response;
}

// ============================================================================
// CoinGecko API Types
// ============================================================================

interface CoinGeckoSimplePrice {
  [coinId: string]: {
    usd?: number;
    eur?: number;
    gbp?: number;
    jpy?: number;
    usd_24h_change?: number;
    usd_market_cap?: number;
    usd_24h_vol?: number;
  };
}

interface CoinGeckoCoinData {
  id: string;
  symbol: string;
  name: string;
  market_data: {
    current_price: Record<string, number>;
    market_cap: Record<string, number>;
    total_volume: Record<string, number>;
    circulating_supply: number;
    total_supply: number | null;
    max_supply: number | null;
    ath: Record<string, number>;
    ath_date: Record<string, string>;
    price_change_percentage_24h: number;
    price_change_percentage_7d: number;
    price_change_percentage_30d: number;
  };
  platforms: Record<string, string>;
}

interface CoinGeckoMarketChart {
  prices: [number, number][];
  market_caps: [number, number][];
  total_volumes: [number, number][];
}

interface CoinGeckoMarketCoin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  total_volume: number;
  price_change_percentage_24h: number;
  circulating_supply: number;
  ath: number;
  ath_date: string;
}

// ============================================================================
// API Functions
// ============================================================================

async function getSimplePrice(
  coinId: string,
  currency: string = "usd"
): Promise<CoinGeckoSimplePrice> {
  const cacheKey = `price:${coinId}:${currency}`;
  const cached = getCached<CoinGeckoSimplePrice>(cacheKey);
  if (cached) return cached;

  const url = `${COINGECKO_BASE}/simple/price?ids=${coinId}&vs_currencies=${currency}&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`;
  const response = await rateLimitedFetch(url);
  const data = await response.json() as CoinGeckoSimplePrice;
  
  setCache(cacheKey, data);
  return data;
}

async function getCoinData(coinId: string): Promise<CoinGeckoCoinData> {
  const cacheKey = `coin:${coinId}`;
  const cached = getCached<CoinGeckoCoinData>(cacheKey);
  if (cached) return cached;

  const url = `${COINGECKO_BASE}/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false`;
  const response = await rateLimitedFetch(url);
  const data = await response.json() as CoinGeckoCoinData;
  
  setCache(cacheKey, data);
  return data;
}

async function getMarketChart(
  coinId: string,
  days: number,
  currency: string = "usd"
): Promise<CoinGeckoMarketChart> {
  const cacheKey = `chart:${coinId}:${days}:${currency}`;
  const cached = getCached<CoinGeckoMarketChart>(cacheKey);
  if (cached) return cached;

  const url = `${COINGECKO_BASE}/coins/${coinId}/market_chart?vs_currency=${currency}&days=${days}`;
  const response = await rateLimitedFetch(url);
  const data = await response.json() as CoinGeckoMarketChart;
  
  setCache(cacheKey, data);
  return data;
}

async function getTopCoins(
  limit: number = 10,
  currency: string = "usd"
): Promise<CoinGeckoMarketCoin[]> {
  const cacheKey = `top:${limit}:${currency}`;
  const cached = getCached<CoinGeckoMarketCoin[]>(cacheKey);
  if (cached) return cached;

  const url = `${COINGECKO_BASE}/coins/markets?vs_currency=${currency}&order=market_cap_desc&per_page=${limit}&page=1&sparkline=false`;
  const response = await rateLimitedFetch(url);
  const data = await response.json() as CoinGeckoMarketCoin[];
  
  setCache(cacheKey, data);
  return data;
}

async function searchCoin(query: string): Promise<string | null> {
  const cacheKey = `search:${query}`;
  const cached = getCached<string | null>(cacheKey);
  if (cached !== null) return cached;

  const url = `${COINGECKO_BASE}/search?query=${encodeURIComponent(query)}`;
  const response = await rateLimitedFetch(url);
  const data = await response.json() as { coins: Array<{ id: string; symbol: string; name: string }> };
  
  const coinId = data.coins?.[0]?.id || null;
  setCache(cacheKey, coinId);
  return coinId;
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatNumber(num: number, decimals: number = 2): string {
  if (num >= 1e12) return `$${(num / 1e12).toFixed(decimals)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(decimals)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(decimals)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(decimals)}K`;
  return `$${num.toFixed(decimals)}`;
}

function formatPrice(price: number): string {
  if (price >= 1000) return `$${price.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(8)}`;
}

function formatChange(change: number | undefined): string {
  if (change === undefined) return "N/A";
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(2)}%`;
}

// Map CoinGecko platforms to readable chain names
function getChainNames(platforms: Record<string, string>): string[] {
  const chainMap: Record<string, string> = {
    ethereum: "Ethereum",
    "polygon-pos": "Polygon",
    "binance-smart-chain": "BNB Chain",
    avalanche: "Avalanche",
    arbitrum: "Arbitrum",
    optimism: "Optimism",
    base: "Base",
    solana: "Solana",
    fantom: "Fantom",
    cronos: "Cronos",
  };
  
  return Object.keys(platforms)
    .map(p => chainMap[p] || p)
    .filter(Boolean);
}

// ============================================================================
// x402 Paid MCP Handler Configuration
// ============================================================================

// Recipient wallet for x402 payments (USDC on Base)
const RECIPIENT_WALLET = (process.env.X402_RECIPIENT_WALLET || process.env.CDP_WALLET_ADDRESS || "0x0000000000000000000000000000000000000000") as `0x${string}`;

const handler = createPaidMcpHandler(
  (server) => {
    // ========================================================================
    // Tool 1: Get Current Price - $0.0001 per request
    // ========================================================================
    server.paidTool(
      "get_crypto_price",
      "Get the current real-time price and 24h change for any cryptocurrency. Data from CoinGecko.",
      { price: 0.0001 },
      {
        token: z
          .string()
          .describe("Token name or symbol (e.g., 'bitcoin', 'BTC', 'ethereum', 'SOL')"),
        currency: z
          .enum(["usd", "eur", "gbp", "jpy"])
          .optional()
          .default("usd")
          .describe("Fiat currency for price display"),
      },
      {}, // annotations
      async ({ token, currency = "usd" }) => {
        const coinId = resolveTokenId(token);
        
        // Try direct lookup first, then search
        let priceData: CoinGeckoSimplePrice;
        try {
          priceData = await getSimplePrice(coinId, currency);
        } catch {
          // If direct lookup fails, try searching
          const searchedId = await searchCoin(token);
          if (!searchedId) {
            return {
              content: [{
                type: "text" as const,
                text: JSON.stringify({
                  error: `Token '${token}' not found`,
                  suggestion: "Try using the full name (e.g., 'bitcoin') or common symbol (e.g., 'BTC')",
                }, null, 2),
              }],
              isError: true,
            };
          }
          priceData = await getSimplePrice(searchedId, currency);
        }

        const data = priceData[coinId] || Object.values(priceData)[0];
        if (!data) {
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({ error: `No price data found for '${token}'` }, null, 2),
            }],
            isError: true,
          };
        }

        const currencyKey = currency as keyof typeof data;
        const price = data[currencyKey] as number | undefined;
        const change24h = data.usd_24h_change;
        const marketCap = data.usd_market_cap;
        const volume24h = data.usd_24h_vol;

        const currencySymbols: Record<string, string> = {
          usd: "$", eur: "€", gbp: "£", jpy: "¥"
        };

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              token: token.toUpperCase(),
              price: {
                value: price,
                currency: currency.toUpperCase(),
                formatted: price ? `${currencySymbols[currency]}${price.toLocaleString()}` : "N/A",
              },
              change24h: formatChange(change24h),
              marketCap: marketCap ? formatNumber(marketCap) : "N/A",
              volume24h: volume24h ? formatNumber(volume24h) : "N/A",
              source: "CoinGecko",
              timestamp: new Date().toISOString(),
            }, null, 2),
          }],
        };
      }
    );

    // ========================================================================
    // Tool 2: Get Detailed Market Data - $0.0002 per request
    // ========================================================================
    server.paidTool(
      "get_market_data",
      "Get comprehensive market data including market cap, volume, supply metrics, and all-time high. Real-time data from CoinGecko.",
      { price: 0.0002 },
      {
        token: z.string().describe("Token name or symbol"),
      },
      {},
      async ({ token }) => {
        let coinId = resolveTokenId(token);
        
        let coinData: CoinGeckoCoinData;
        try {
          coinData = await getCoinData(coinId);
        } catch {
          const searchedId = await searchCoin(token);
          if (!searchedId) {
            return {
              content: [{
                type: "text" as const,
                text: JSON.stringify({ error: `Token '${token}' not found` }, null, 2),
              }],
              isError: true,
            };
          }
          coinId = searchedId;
          coinData = await getCoinData(coinId);
        }

        const md = coinData.market_data;
        const chains = getChainNames(coinData.platforms);

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              name: coinData.name,
              symbol: coinData.symbol.toUpperCase(),
              price: formatPrice(md.current_price.usd),
              market: {
                cap: formatNumber(md.market_cap.usd),
                capRaw: md.market_cap.usd,
                volume24h: formatNumber(md.total_volume.usd),
                volumeRaw: md.total_volume.usd,
              },
              supply: {
                circulating: md.circulating_supply?.toLocaleString() || "N/A",
                total: md.total_supply?.toLocaleString() || "N/A",
                max: md.max_supply?.toLocaleString() || "Unlimited",
              },
              performance: {
                change24h: formatChange(md.price_change_percentage_24h),
                change7d: formatChange(md.price_change_percentage_7d),
                change30d: formatChange(md.price_change_percentage_30d),
              },
              allTimeHigh: {
                price: formatPrice(md.ath.usd),
                date: md.ath_date.usd?.split("T")[0] || "N/A",
                percentFromAth: `${(((md.ath.usd - md.current_price.usd) / md.ath.usd) * 100).toFixed(1)}% below ATH`,
              },
              chains: chains.length > 0 ? chains : ["Native"],
              source: "CoinGecko",
              timestamp: new Date().toISOString(),
            }, null, 2),
          }],
        };
      }
    );

    // ========================================================================
    // Tool 3: Get Price History - $0.0005 per request
    // ========================================================================
    server.paidTool(
      "get_price_history",
      "Get historical price data with OHLC-style information. Returns daily prices for the specified period.",
      { price: 0.0005 },
      {
        token: z.string().describe("Token name or symbol"),
        days: z
          .number()
          .int()
          .min(1)
          .max(365)
          .optional()
          .default(30)
          .describe("Number of days of history (1-365)"),
      },
      {},
      async ({ token, days = 30 }) => {
        let coinId = resolveTokenId(token);
        
        let chartData: CoinGeckoMarketChart;
        try {
          chartData = await getMarketChart(coinId, days);
        } catch {
          const searchedId = await searchCoin(token);
          if (!searchedId) {
            return {
              content: [{
                type: "text" as const,
                text: JSON.stringify({ error: `Token '${token}' not found` }, null, 2),
              }],
              isError: true,
            };
          }
          coinId = searchedId;
          chartData = await getMarketChart(coinId, days);
        }

        const prices = chartData.prices;
        const priceValues = prices.map(p => p[1]);
        
        const high = Math.max(...priceValues);
        const low = Math.min(...priceValues);
        const avg = priceValues.reduce((a, b) => a + b, 0) / priceValues.length;
        const startPrice = priceValues[0];
        const endPrice = priceValues[priceValues.length - 1];
        const changePercent = ((endPrice - startPrice) / startPrice) * 100;

        // Sample data points for response (every nth point to keep response size reasonable)
        const sampleInterval = Math.max(1, Math.floor(prices.length / 14));
        const sampledHistory = prices
          .filter((_, i) => i % sampleInterval === 0 || i === prices.length - 1)
          .map(([timestamp, price]) => ({
            date: new Date(timestamp).toISOString().split("T")[0],
            price: formatPrice(price),
            priceRaw: price,
          }));

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              token: token.toUpperCase(),
              period: `${days} days`,
              summary: {
                high: formatPrice(high),
                low: formatPrice(low),
                average: formatPrice(avg),
                change: formatChange(changePercent),
                startPrice: formatPrice(startPrice),
                endPrice: formatPrice(endPrice),
              },
              dataPoints: prices.length,
              history: sampledHistory,
              source: "CoinGecko",
              timestamp: new Date().toISOString(),
            }, null, 2),
          }],
        };
      }
    );

    // ========================================================================
    // Tool 4: Get Top Cryptocurrencies - $0.0003 per request
    // ========================================================================
    server.paidTool(
      "get_top_tokens",
      "Get the top cryptocurrencies ranked by market cap with current prices and 24h changes.",
      { price: 0.0003 },
      {
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .default(10)
          .describe("Number of tokens to return (1-100)"),
      },
      {},
      async ({ limit = 10 }) => {
        const topCoins = await getTopCoins(limit);

        const tokens = topCoins.map((coin) => ({
          rank: coin.market_cap_rank,
          name: coin.name,
          symbol: coin.symbol.toUpperCase(),
          price: formatPrice(coin.current_price),
          priceRaw: coin.current_price,
          marketCap: formatNumber(coin.market_cap),
          volume24h: formatNumber(coin.total_volume),
          change24h: formatChange(coin.price_change_percentage_24h),
        }));

        const totalMarketCap = topCoins.reduce((sum, c) => sum + c.market_cap, 0);

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              topTokens: tokens,
              totalMarketCap: formatNumber(totalMarketCap),
              count: tokens.length,
              source: "CoinGecko",
              timestamp: new Date().toISOString(),
            }, null, 2),
          }],
        };
      }
    );

    // ========================================================================
    // Tool 5: Compare Multiple Tokens - $0.0003 per request
    // ========================================================================
    server.paidTool(
      "compare_tokens",
      "Compare prices and performance of multiple cryptocurrencies side by side.",
      { price: 0.0003 },
      {
        tokens: z
          .array(z.string())
          .min(2)
          .max(5)
          .describe("Array of token names/symbols to compare (2-5 tokens)"),
      },
      {},
      async ({ tokens }) => {
        const coinIds = tokens.map(resolveTokenId);
        const idsParam = coinIds.join(",");
        
        const url = `${COINGECKO_BASE}/simple/price?ids=${idsParam}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`;
        const response = await rateLimitedFetch(url);
        const priceData = await response.json() as CoinGeckoSimplePrice;

        const comparison = Object.entries(priceData).map(([id, data]) => ({
          token: id,
          price: data.usd ? formatPrice(data.usd) : "N/A",
          priceRaw: data.usd || 0,
          change24h: formatChange(data.usd_24h_change),
          marketCap: data.usd_market_cap ? formatNumber(data.usd_market_cap) : "N/A",
        }));

        // Sort by market cap
        comparison.sort((a, b) => {
          const capA = priceData[a.token]?.usd_market_cap || 0;
          const capB = priceData[b.token]?.usd_market_cap || 0;
          return capB - capA;
        });

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              comparison,
              tokensRequested: tokens,
              tokensFound: comparison.length,
              source: "CoinGecko",
              timestamp: new Date().toISOString(),
            }, null, 2),
          }],
        };
      }
    );

    // ========================================================================
    // Tool 6: Search for a Token - $0.0001 per request
    // ========================================================================
    server.paidTool(
      "search_token",
      "Search for a cryptocurrency by name or symbol to find its CoinGecko ID and basic info.",
      { price: 0.0001 },
      {
        query: z.string().describe("Search query (token name or symbol)"),
      },
      {},
      async ({ query }) => {
        const url = `${COINGECKO_BASE}/search?query=${encodeURIComponent(query)}`;
        const response = await rateLimitedFetch(url);
        const data = await response.json() as { 
          coins: Array<{ 
            id: string; 
            symbol: string; 
            name: string;
            market_cap_rank: number | null;
            thumb: string;
          }> 
        };

        const results = data.coins.slice(0, 10).map(coin => ({
          id: coin.id,
          name: coin.name,
          symbol: coin.symbol.toUpperCase(),
          marketCapRank: coin.market_cap_rank || "Unranked",
        }));

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              query,
              results,
              count: results.length,
              tip: "Use the 'id' field with other tools for best results",
              source: "CoinGecko",
              timestamp: new Date().toISOString(),
            }, null, 2),
          }],
        };
      }
    );
  },
  {}, // serverOptions
  {
    recipient: RECIPIENT_WALLET,
    network: "base", // Base L2 for fast, cheap USDC payments
    facilitator: {
      url: "https://x402.org/facilitator",
    },
  }
);

// ============================================================================
// Route Handlers
// ============================================================================

// GET handler - return server info with x402 pricing
export async function GET() {
  const isPro = !!COINGECKO_API_KEY;
  
  return NextResponse.json({
    name: "Crypto Price MCP",
    version: "2.0.0",
    description: `Real-time cryptocurrency prices, market data, and historical charts powered by CoinGecko ${isPro ? "Pro" : "Free"} API with x402 micropayments.`,
    transport: ["http", "sse"],
    tools: [
      { 
        name: "get_crypto_price", 
        description: "Get current price and 24h change for any token",
        price: "$0.0001",
        example: { token: "bitcoin", currency: "usd" }
      },
      { 
        name: "get_market_data", 
        description: "Get comprehensive market data including supply, ATH, multi-chain info",
        price: "$0.0002",
        example: { token: "ethereum" }
      },
      { 
        name: "get_price_history", 
        description: "Get historical price data for charting",
        price: "$0.0005",
        example: { token: "solana", days: 30 }
      },
      { 
        name: "get_top_tokens", 
        description: "Get top cryptocurrencies by market cap",
        price: "$0.0003",
        example: { limit: 10 }
      },
      { 
        name: "compare_tokens", 
        description: "Compare multiple tokens side by side",
        price: "$0.0003",
        example: { tokens: ["bitcoin", "ethereum", "solana"] }
      },
      { 
        name: "search_token", 
        description: "Search for any cryptocurrency",
        price: "$0.0001",
        example: { query: "pepe" }
      },
    ],
    payment: {
      protocol: "x402",
      network: "base",
      currency: "USDC",
      recipient: RECIPIENT_WALLET,
      priceRange: "$0.0001 - $0.0005 per request",
      facilitator: "https://x402.org/facilitator",
    },
    dataSource: {
      provider: "CoinGecko",
      tier: isPro ? "Pro API" : "Free API",
      type: "real-time",
      cacheTime: isPro ? "30 seconds" : "60 seconds",
      rateLimit: isPro ? "500 calls/min" : "10-50 calls/min",
    },
    supportedCurrencies: ["USD", "EUR", "GBP", "JPY"],
    commonTokens: Object.keys(TOKEN_ID_MAP).slice(0, 20),
    status: "live",
  });
}

// POST handler - handle MCP protocol with x402 payments
export async function POST(req: NextRequest) {
  return await handler(req as unknown as Request);
}

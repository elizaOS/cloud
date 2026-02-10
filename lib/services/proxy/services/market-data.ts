import { NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import type { ServiceConfig, ServiceHandler } from "../types";
import { getServiceMethodCost } from "../pricing";
import { PROXY_CONFIG } from "../config";
import { retryFetch } from "../fetch";

const PROVIDER_PATHS: Record<string, string> = {
  getPrice: "/defi/price",
  getPriceHistorical: "/defi/history_price",
  getOHLCV: "/defi/ohlcv",
  getTokenOverview: "/defi/token_overview",
  getTokenSecurity: "/defi/token_security",
  getTokenMetadata: "/defi/v3/token/meta-data/single",
  getTokenTrades: "/defi/txs/token",
  getTrending: "/defi/token_trending",
  getWalletPortfolio: "/v1/wallet/token_list",
  search: "/defi/v3/search",
};

const NON_CACHEABLE_METHODS = new Set([
  "getTokenTrades",
  "getTrending",
  "search",
]);

export interface MarketDataRequest {
  method: string;
  chain: string;
  params: Record<string, string | number | boolean>;
}

export const marketDataConfig: ServiceConfig = {
  id: "market-data",
  name: "Market Data",
  auth: "apiKeyWithOrg",
  rateLimit: {
    windowMs: 60_000,
    maxRequests: 100,
  },
  cache: {
    maxTTL: 30,
    hitCostMultiplier: 0.5,
    isMethodCacheable: (method) => !NON_CACHEABLE_METHODS.has(method),
    maxResponseSize: 131_072,
  },
  getCost: async (body) => {
    const { method } = body as MarketDataRequest;
    return getServiceMethodCost("market-data", method);
  },
};

export const marketDataHandler: ServiceHandler = async ({ body }) => {
  const { method, chain, params } = body as MarketDataRequest;

  const path = PROVIDER_PATHS[method];
  if (!path) {
    throw new Error(`Unknown market data method: ${method}`);
  }

  const apiKey = process.env.MARKET_DATA_PROVIDER_API_KEY;
  if (!apiKey) {
    throw new Error("MARKET_DATA_PROVIDER_API_KEY not configured");
  }

  const queryParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    queryParams.append(key, String(value));
  }

  const url = `${PROXY_CONFIG.MARKET_DATA_BASE_URL}${path}?${queryParams.toString()}`;

  try {
    const response = await retryFetch({
      url,
      init: {
        method: "GET",
        headers: {
          "X-API-KEY": apiKey,
          "x-chain": chain,
        },
      },
      maxRetries: PROXY_CONFIG.MARKET_DATA_MAX_RETRIES,
      initialDelayMs: PROXY_CONFIG.MARKET_DATA_INITIAL_RETRY_DELAY_MS,
      timeoutMs: PROXY_CONFIG.MARKET_DATA_TIMEOUT_MS,
      serviceTag: "Market Data",
      nonRetriableStatuses: [400, 404],
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error("[Market Data] Provider error", {
        method,
        chain,
        status: response.status,
        body: errorBody,
      });

      return {
        response: NextResponse.json(
          {
            error: "Market data provider error",
            code: response.status,
          },
          { status: 502 },
        ),
      };
    }

    return { response };
  } catch (error) {
    logger.error("[Market Data] Request failed", {
      method,
      chain,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    throw error;
  }
};

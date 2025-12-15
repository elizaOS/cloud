/**
 * CoinGecko API Zod Schemas
 *
 * Validation schemas for CoinGecko API requests.
 */

import { z } from "zod";

/**
 * Supported currencies
 */
export const CurrencySchema = z.enum([
  "usd",
  "eur",
  "gbp",
  "jpy",
  "cny",
  "krw",
  "btc",
  "eth",
  "aud",
  "cad",
  "chf",
  "hkd",
  "inr",
  "sgd",
  "twd",
  "brl",
]);

/**
 * Time range for historical data
 */
export const TimeRangeSchema = z.enum([
  "1h",
  "24h",
  "7d",
  "14d",
  "30d",
  "90d",
  "180d",
  "1y",
  "max",
]);

/**
 * Sort order
 */
export const SortOrderSchema = z.enum([
  "market_cap_desc",
  "market_cap_asc",
  "volume_desc",
  "volume_asc",
  "id_desc",
  "id_asc",
]);

/**
 * Simple price request
 */
export const GetSimplePriceSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "At least one coin ID is required"),
  vsCurrencies: z.array(CurrencySchema).min(1).default(["usd"]),
  includeMarketCap: z.boolean().optional().default(false),
  include24hVol: z.boolean().optional().default(false),
  include24hChange: z.boolean().optional().default(false),
  includeLastUpdatedAt: z.boolean().optional().default(false),
});

/**
 * Market coins request
 */
export const GetMarketsSchema = z.object({
  vsCurrency: CurrencySchema.optional().default("usd"),
  ids: z.array(z.string()).optional(),
  category: z.string().optional(),
  order: SortOrderSchema.optional().default("market_cap_desc"),
  perPage: z.number().int().min(1).max(250).optional().default(100),
  page: z.number().int().min(1).optional().default(1),
  sparkline: z.boolean().optional().default(false),
  priceChangePercentage: z
    .array(z.enum(["1h", "24h", "7d", "14d", "30d", "200d", "1y"]))
    .optional(),
});

/**
 * Coin detail request
 */
export const GetCoinDetailSchema = z.object({
  id: z.string().min(1, "Coin ID is required"),
  localization: z.boolean().optional().default(false),
  tickers: z.boolean().optional().default(false),
  marketData: z.boolean().optional().default(true),
  communityData: z.boolean().optional().default(false),
  developerData: z.boolean().optional().default(false),
  sparkline: z.boolean().optional().default(false),
});

/**
 * Market chart request
 */
export const GetMarketChartSchema = z.object({
  id: z.string().min(1, "Coin ID is required"),
  vsCurrency: CurrencySchema.optional().default("usd"),
  days: z.union([z.number().int().min(1), z.literal("max")]),
  interval: z.enum(["daily", "hourly"]).optional(),
});

/**
 * OHLC request
 */
export const GetOHLCSchema = z.object({
  id: z.string().min(1, "Coin ID is required"),
  vsCurrency: CurrencySchema.optional().default("usd"),
  days: z.enum(["1", "7", "14", "30", "90", "180", "365", "max"]),
});

/**
 * Search request
 */
export const SearchSchema = z.object({
  query: z.string().min(1, "Search query is required"),
});

/**
 * Coin list request
 */
export const GetCoinListSchema = z.object({
  includePlatform: z.boolean().optional().default(false),
});

/**
 * Exchanges request
 */
export const GetExchangesSchema = z.object({
  perPage: z.number().int().min(1).max(250).optional().default(100),
  page: z.number().int().min(1).optional().default(1),
});

/**
 * Token price by contract address
 */
export const GetTokenPriceSchema = z.object({
  platform: z.enum([
    "ethereum",
    "polygon-pos",
    "binance-smart-chain",
    "solana",
    "base",
    "arbitrum-one",
    "optimistic-ethereum",
    "avalanche",
  ]),
  contractAddresses: z.array(z.string().min(1)).min(1),
  vsCurrencies: z.array(CurrencySchema).min(1).default(["usd"]),
  includeMarketCap: z.boolean().optional().default(false),
  include24hVol: z.boolean().optional().default(false),
  include24hChange: z.boolean().optional().default(false),
});

export type GetSimplePriceInput = z.infer<typeof GetSimplePriceSchema>;
export type GetMarketsInput = z.infer<typeof GetMarketsSchema>;
export type GetCoinDetailInput = z.infer<typeof GetCoinDetailSchema>;
export type GetMarketChartInput = z.infer<typeof GetMarketChartSchema>;
export type GetOHLCInput = z.infer<typeof GetOHLCSchema>;
export type SearchInput = z.infer<typeof SearchSchema>;
export type GetCoinListInput = z.infer<typeof GetCoinListSchema>;
export type GetExchangesInput = z.infer<typeof GetExchangesSchema>;
export type GetTokenPriceInput = z.infer<typeof GetTokenPriceSchema>;

/**
 * Birdeye API Zod Schemas
 *
 * Validation schemas for Birdeye API requests and responses.
 */

import { z } from "zod";

/**
 * Valid OHLCV time intervals
 */
export const BirdeyeTimeIntervalSchema = z.enum([
  "1m", "3m", "5m", "15m", "30m",
  "1H", "2H", "4H", "6H", "8H", "12H",
  "1D", "3D", "1W", "1M",
]);

/**
 * Supported chains
 */
export const BirdeyeChainSchema = z.enum([
  "solana", "ethereum", "arbitrum", "avalanche",
  "bsc", "optimism", "polygon", "base", "zksync", "sui",
]);

/**
 * Token price request
 */
export const GetTokenPriceSchema = z.object({
  address: z.string().min(1, "Token address is required"),
  chain: BirdeyeChainSchema.optional().default("solana"),
});

/**
 * OHLCV request
 */
export const GetOHLCVSchema = z.object({
  address: z.string().min(1, "Token address is required"),
  interval: BirdeyeTimeIntervalSchema.optional().default("1H"),
  timeFrom: z.number().int().positive().optional(),
  timeTo: z.number().int().positive().optional(),
  chain: BirdeyeChainSchema.optional().default("solana"),
});

/**
 * Token transactions request
 */
export const GetTokenTransactionsSchema = z.object({
  address: z.string().min(1, "Token address is required"),
  offset: z.number().int().min(0).optional().default(0),
  limit: z.number().int().min(1).max(100).optional().default(50),
  txType: z.enum(["swap", "all"]).optional().default("swap"),
  chain: BirdeyeChainSchema.optional().default("solana"),
});

/**
 * Wallet portfolio request
 */
export const GetWalletPortfolioSchema = z.object({
  wallet: z.string().min(1, "Wallet address is required"),
  chain: BirdeyeChainSchema.optional().default("solana"),
});

/**
 * Trending tokens request
 */
export const GetTrendingTokensSchema = z.object({
  offset: z.number().int().min(0).optional().default(0),
  limit: z.number().int().min(1).max(100).optional().default(20),
  chain: BirdeyeChainSchema.optional().default("solana"),
});

/**
 * Token search request
 */
export const SearchTokensSchema = z.object({
  keyword: z.string().min(1, "Search keyword is required"),
  offset: z.number().int().min(0).optional().default(0),
  limit: z.number().int().min(1).max(100).optional().default(20),
  sortBy: z.enum(["volume24hUSD", "liquidity", "marketcap"]).optional().default("volume24hUSD"),
  sortType: z.enum(["asc", "desc"]).optional().default("desc"),
  chain: BirdeyeChainSchema.optional().default("solana"),
});

/**
 * Token overview request
 */
export const GetTokenOverviewSchema = z.object({
  address: z.string().min(1, "Token address is required"),
  chain: BirdeyeChainSchema.optional().default("solana"),
});

/**
 * Token security request
 */
export const GetTokenSecuritySchema = z.object({
  address: z.string().min(1, "Token address is required"),
  chain: BirdeyeChainSchema.optional().default("solana"),
});

/**
 * Multi-price request
 */
export const GetMultiPriceSchema = z.object({
  addresses: z.array(z.string().min(1)).min(1).max(100),
  chain: BirdeyeChainSchema.optional().default("solana"),
});

export type GetTokenPriceInput = z.infer<typeof GetTokenPriceSchema>;
export type GetOHLCVInput = z.infer<typeof GetOHLCVSchema>;
export type GetTokenTransactionsInput = z.infer<typeof GetTokenTransactionsSchema>;
export type GetWalletPortfolioInput = z.infer<typeof GetWalletPortfolioSchema>;
export type GetTrendingTokensInput = z.infer<typeof GetTrendingTokensSchema>;
export type SearchTokensInput = z.infer<typeof SearchTokensSchema>;
export type GetTokenOverviewInput = z.infer<typeof GetTokenOverviewSchema>;
export type GetTokenSecurityInput = z.infer<typeof GetTokenSecuritySchema>;
export type GetMultiPriceInput = z.infer<typeof GetMultiPriceSchema>;


/**
 * DeFi Services - Shared Types
 *
 * Common types and interfaces used across all DeFi service integrations.
 */

/**
 * Supported blockchain networks
 */
export type ChainId =
  | "solana"
  | "ethereum"
  | "base"
  | "arbitrum"
  | "optimism"
  | "polygon"
  | "bsc"
  | "avalanche";

/**
 * Chain metadata for cross-chain operations
 */
export const CHAIN_METADATA: Record<
  ChainId,
  { name: string; nativeCurrency: string; decimals: number; isEVM: boolean }
> = {
  solana: { name: "Solana", nativeCurrency: "SOL", decimals: 9, isEVM: false },
  ethereum: { name: "Ethereum", nativeCurrency: "ETH", decimals: 18, isEVM: true },
  base: { name: "Base", nativeCurrency: "ETH", decimals: 18, isEVM: true },
  arbitrum: { name: "Arbitrum", nativeCurrency: "ETH", decimals: 18, isEVM: true },
  optimism: { name: "Optimism", nativeCurrency: "ETH", decimals: 18, isEVM: true },
  polygon: { name: "Polygon", nativeCurrency: "MATIC", decimals: 18, isEVM: true },
  bsc: { name: "BNB Chain", nativeCurrency: "BNB", decimals: 18, isEVM: true },
  avalanche: { name: "Avalanche", nativeCurrency: "AVAX", decimals: 18, isEVM: true },
};

/**
 * Token information
 */
export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  chainId: ChainId;
  logoUri?: string;
}

/**
 * Token price data
 */
export interface TokenPrice {
  address: string;
  symbol: string;
  priceUsd: number;
  priceChange24h?: number;
  volume24h?: number;
  marketCap?: number;
  lastUpdated: Date;
}

/**
 * OHLCV (candlestick) data point
 */
export interface OHLCVDataPoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Time intervals for historical data
 */
export type TimeInterval = "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d" | "1w";

/**
 * Swap quote request
 */
export interface SwapQuoteRequest {
  inputToken: string;
  outputToken: string;
  amount: string;
  slippageBps?: number;
  userAddress?: string;
}

/**
 * Swap quote response
 */
export interface SwapQuote {
  inputToken: TokenInfo;
  outputToken: TokenInfo;
  inputAmount: string;
  outputAmount: string;
  priceImpactPercent: number;
  routes: SwapRoute[];
  estimatedGas?: string;
  fee?: {
    amount: string;
    token: string;
  };
}

/**
 * Swap route through DEXs
 */
export interface SwapRoute {
  protocol: string;
  inputToken: string;
  outputToken: string;
  portion: number;
}

/**
 * Transaction data for swap execution
 */
export interface SwapTransaction {
  to: string;
  data: string;
  value: string;
  gasLimit?: string;
  chainId?: number;
}

/**
 * Wallet portfolio entry
 */
export interface WalletHolding {
  token: TokenInfo;
  balance: string;
  balanceUsd: number;
  percentage: number;
}

/**
 * Wallet portfolio summary
 */
export interface WalletPortfolio {
  address: string;
  totalValueUsd: number;
  holdings: WalletHolding[];
  lastUpdated: Date;
}

/**
 * Trending token entry
 */
export interface TrendingToken {
  token: TokenInfo;
  rank: number;
  priceUsd: number;
  priceChange24h: number;
  volume24h: number;
  trendScore?: number;
}

/**
 * Market overview data
 */
export interface MarketOverview {
  totalMarketCapUsd: number;
  totalVolume24hUsd: number;
  btcDominance: number;
  ethDominance: number;
  activeCoins: number;
  lastUpdated: Date;
}

/**
 * Liquidity pool information
 */
export interface LiquidityPool {
  address: string;
  protocol: string;
  token0: TokenInfo;
  token1: TokenInfo;
  reserve0: string;
  reserve1: string;
  totalValueLockedUsd: number;
  volume24hUsd: number;
  fee: number;
}

/**
 * Transaction record
 */
export interface TokenTransaction {
  signature: string;
  blockTime: number;
  type: "swap" | "transfer" | "mint" | "burn";
  tokenAddress: string;
  amount: string;
  priceUsd?: number;
  from: string;
  to: string;
}

/**
 * API error response
 */
export interface DeFiApiError {
  code: string;
  message: string;
  statusCode: number;
  provider: string;
}

/**
 * Rate limit information
 */
export interface RateLimitInfo {
  remaining: number;
  limit: number;
  resetAt: Date;
}

/**
 * Service health status
 */
export interface ServiceHealth {
  provider: string;
  status: "healthy" | "degraded" | "down";
  latencyMs: number;
  lastChecked: Date;
  rateLimit?: RateLimitInfo;
}


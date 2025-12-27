/**
 * Birdeye API Types
 *
 * Type definitions for Birdeye API responses and requests.
 * Based on: https://docs.birdeye.so/
 */

/**
 * Birdeye API response wrapper
 */
export interface BirdeyeResponse<T> {
  success: boolean;
  data: T;
}

/**
 * Token price response from /defi/price
 */
export interface BirdeyePriceData {
  value: number;
  updateUnixTime: number;
  updateHumanTime: string;
  priceChange24h: number;
}

/**
 * Token overview response from /defi/token_overview
 */
export interface BirdeyeTokenOverview {
  address: string;
  decimals: number;
  symbol: string;
  name: string;
  extensions: {
    coingeckoId?: string;
    website?: string;
    twitter?: string;
    discord?: string;
  };
  logoURI: string;
  liquidity: number;
  lastTradeUnixTime: number;
  lastTradeHumanTime: string;
  price: number;
  history24hPrice: number;
  priceChange24hPercent: number;
  history24hVolume: number;
  trade24h: number;
  sell24h: number;
  buy24h: number;
  v24hUSD: number;
  v24hChangePercent: number;
  mc: number;
  holder: number;
  supply: number;
}

/**
 * OHLCV response from /defi/ohlcv
 */
export interface BirdeyeOHLCVItem {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  unixTime: number;
  type: string;
}

/**
 * OHLCV request parameters
 */
export interface BirdeyeOHLCVParams {
  address: string;
  type:
    | "1m"
    | "3m"
    | "5m"
    | "15m"
    | "30m"
    | "1H"
    | "2H"
    | "4H"
    | "6H"
    | "8H"
    | "12H"
    | "1D"
    | "3D"
    | "1W"
    | "1M";
  time_from?: number;
  time_to?: number;
}

/**
 * Token transaction from /defi/txs/token
 */
export interface BirdeyeTokenTransaction {
  txHash: string;
  blockUnixTime: number;
  source: string;
  owner: string;
  from: {
    symbol: string;
    decimals: number;
    address: string;
    amount: number;
    uiAmount: number;
    price: number | null;
    nearestPrice: number;
    changeAmount: number;
    uiChangeAmount: number;
  };
  to: {
    symbol: string;
    decimals: number;
    address: string;
    amount: number;
    uiAmount: number;
    price: number | null;
    nearestPrice: number;
    changeAmount: number;
    uiChangeAmount: number;
  };
  side: "buy" | "sell";
  volumeUSD: number;
}

/**
 * Transaction list response
 */
export interface BirdeyeTransactionListData {
  items: BirdeyeTokenTransaction[];
  hasNext: boolean;
}

/**
 * Trending tokens response from /defi/token_trending
 */
export interface BirdeyeTrendingToken {
  address: string;
  decimals: number;
  symbol: string;
  name: string;
  logoURI: string;
  liquidity: number;
  price: number;
  priceChange24hPercent: number;
  v24hUSD: number;
  rank: number;
}

/**
 * Wallet token list from /v1/wallet/token_list
 */
export interface BirdeyeWalletToken {
  address: string;
  decimals: number;
  symbol: string;
  name: string;
  logoURI: string;
  uiAmount: number;
  chainId: string;
  valueUsd: number | null;
  priceUsd: number | null;
}

/**
 * Wallet portfolio response
 */
export interface BirdeyeWalletPortfolio {
  wallet: string;
  totalUsd: number;
  items: BirdeyeWalletToken[];
}

/**
 * Token security data from /defi/token_security
 */
export interface BirdeyeTokenSecurity {
  creatorAddress: string;
  ownerAddress: string;
  ownerBalance: string;
  ownerPercentage: number;
  creatorBalance: string;
  creatorPercentage: number;
  metaplexUpdateAuthority: string;
  metaplexUpdateAuthorityBalance: string;
  metaplexUpdateAuthorityPercent: number;
  mutableMetadata: boolean;
  top10HolderBalance: string;
  top10HolderPercent: number;
  top10UserBalance: string;
  top10UserPercent: number;
  isTrueToken: boolean;
  totalSupply: string;
  preMarketHolder: unknown[];
  lockInfo: unknown | null;
  freezeable: boolean | null;
  freezeAuthority: string | null;
  transferFeeEnable: boolean | null;
  transferFeeData: unknown | null;
  isToken2022: boolean;
  nonTransferable: boolean | null;
}

/**
 * Token creation info from /defi/token_creation_info
 */
export interface BirdeyeTokenCreationInfo {
  txHash: string;
  slot: number;
  tokenAddress: string;
  decimals: number;
  owner: string;
  blockUnixTime: number;
  blockHumanTime: string;
}

/**
 * Multi-price request for batch pricing
 */
export interface BirdeyeMultiPriceRequest {
  list_address: string;
}

/**
 * Multi-price response item
 */
export interface BirdeyeMultiPriceItem {
  value: number;
  updateUnixTime: number;
  updateHumanTime: string;
  priceChange24h: number;
}

/**
 * Token list search parameters
 */
export interface BirdeyeTokenSearchParams {
  keyword: string;
  offset?: number;
  limit?: number;
  sort_by?: "volume24hUSD" | "liquidity" | "marketcap";
  sort_type?: "asc" | "desc";
}

/**
 * Token search result
 */
export interface BirdeyeTokenSearchResult {
  address: string;
  decimals: number;
  symbol: string;
  name: string;
  logoURI: string;
  v24hUSD: number;
  liquidity: number;
  mc: number;
}

/**
 * New token listing
 */
export interface BirdeyeNewListing {
  address: string;
  decimals: number;
  symbol: string;
  name: string;
  logoURI: string;
  v24hUSD: number;
  liquidity: number;
  listedAt: number;
}

/**
 * Market data for token
 */
export interface BirdeyeMarketData {
  address: string;
  price: number;
  priceChange24h: number;
  priceChange7d: number;
  volume24h: number;
  volume7d: number;
  marketCap: number;
  liquidity: number;
  holders: number;
}

/**
 * Supported chain for Birdeye
 */
export type BirdeyeChain =
  | "solana"
  | "ethereum"
  | "arbitrum"
  | "avalanche"
  | "bsc"
  | "optimism"
  | "polygon"
  | "base"
  | "zksync"
  | "sui";

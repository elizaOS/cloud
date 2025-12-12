/**
 * Birdeye Service
 *
 * Provides Solana DeFi analytics including token prices, OHLCV data,
 * wallet portfolios, trending tokens, and transaction history.
 *
 * API Documentation: https://docs.birdeye.so/
 */

import { logger } from "@/lib/utils/logger";
import { BirdeyeClient } from "./client";
import type {
  BirdeyeChain,
  BirdeyePriceData,
  BirdeyeTokenOverview,
  BirdeyeOHLCVItem,
  BirdeyeTokenTransaction,
  BirdeyeTrendingToken,
  BirdeyeWalletPortfolio,
  BirdeyeTokenSecurity,
  BirdeyeTokenCreationInfo,
  BirdeyeTokenSearchResult,
  BirdeyeResponse,
  BirdeyeTransactionListData,
} from "./types";
import type {
  TokenPrice,
  OHLCVDataPoint,
  WalletPortfolio,
  TrendingToken,
  TokenTransaction,
  TokenInfo,
} from "../types";

export * from "./types";
export * from "./schemas";

/**
 * Birdeye service configuration
 */
export interface BirdeyeConfig {
  apiKey: string;
  defaultChain?: BirdeyeChain;
  timeout?: number;
}

/**
 * Birdeye Service Class
 *
 * Comprehensive Solana DeFi analytics service.
 */
export class BirdeyeService {
  private readonly client: BirdeyeClient;
  private readonly config: BirdeyeConfig;

  constructor(config: BirdeyeConfig) {
    this.config = config;
    this.client = new BirdeyeClient(
      { apiKey: config.apiKey, timeout: config.timeout },
      config.defaultChain ?? "solana"
    );
  }

  /**
   * Initialize service from environment variables
   */
  static fromEnv(): BirdeyeService {
    const apiKey = process.env.BIRDEYE_API_KEY;

    if (!apiKey) {
      throw new Error("BIRDEYE_API_KEY environment variable is required");
    }

    return new BirdeyeService({
      apiKey,
      defaultChain: (process.env.BIRDEYE_DEFAULT_CHAIN as BirdeyeChain) ?? "solana",
      timeout: process.env.BIRDEYE_TIMEOUT
        ? parseInt(process.env.BIRDEYE_TIMEOUT, 10)
        : undefined,
    });
  }

  /**
   * Get a client for a specific chain
   */
  forChain(chain: BirdeyeChain): BirdeyeClient {
    return this.client.withChain(chain);
  }

  /**
   * Get current token price
   */
  async getTokenPrice(
    address: string,
    chain?: BirdeyeChain
  ): Promise<TokenPrice> {
    const client = chain ? this.client.withChain(chain) : this.client;

    logger.info(`[Birdeye] Getting price for ${address} on ${chain ?? this.config.defaultChain}`);

    const response = await client.get<BirdeyeResponse<BirdeyePriceData>>(
      "/defi/price",
      { address }
    );

    if (!response.success) {
      throw new Error("Failed to fetch token price from Birdeye");
    }

    return {
      address,
      symbol: "", // Price endpoint doesn't return symbol
      priceUsd: response.data.value,
      priceChange24h: response.data.priceChange24h,
      lastUpdated: new Date(response.data.updateUnixTime * 1000),
    };
  }

  /**
   * Get prices for multiple tokens
   */
  async getMultiPrice(
    addresses: string[],
    chain?: BirdeyeChain
  ): Promise<Map<string, TokenPrice>> {
    const client = chain ? this.client.withChain(chain) : this.client;

    logger.info(`[Birdeye] Getting prices for ${addresses.length} tokens`);

    const response = await client.get<BirdeyeResponse<Record<string, BirdeyePriceData>>>(
      "/defi/multi_price",
      { list_address: addresses.join(",") }
    );

    if (!response.success) {
      throw new Error("Failed to fetch multi-price from Birdeye");
    }

    const prices = new Map<string, TokenPrice>();

    for (const [address, data] of Object.entries(response.data)) {
      prices.set(address, {
        address,
        symbol: "",
        priceUsd: data.value,
        priceChange24h: data.priceChange24h,
        lastUpdated: new Date(data.updateUnixTime * 1000),
      });
    }

    return prices;
  }

  /**
   * Get detailed token overview
   */
  async getTokenOverview(
    address: string,
    chain?: BirdeyeChain
  ): Promise<BirdeyeTokenOverview> {
    const client = chain ? this.client.withChain(chain) : this.client;

    logger.info(`[Birdeye] Getting token overview for ${address}`);

    const response = await client.get<BirdeyeResponse<BirdeyeTokenOverview>>(
      "/defi/token_overview",
      { address }
    );

    if (!response.success) {
      throw new Error("Failed to fetch token overview from Birdeye");
    }

    return response.data;
  }

  /**
   * Get OHLCV (candlestick) data
   */
  async getOHLCV(
    address: string,
    options: {
      interval?: "1m" | "5m" | "15m" | "30m" | "1H" | "4H" | "1D" | "1W";
      timeFrom?: number;
      timeTo?: number;
    } = {},
    chain?: BirdeyeChain
  ): Promise<OHLCVDataPoint[]> {
    const client = chain ? this.client.withChain(chain) : this.client;

    logger.info(`[Birdeye] Getting OHLCV for ${address}, interval: ${options.interval ?? "1H"}`);

    const response = await client.get<BirdeyeResponse<{ items: BirdeyeOHLCVItem[] }>>(
      "/defi/ohlcv",
      {
        address,
        type: options.interval ?? "1H",
        time_from: options.timeFrom,
        time_to: options.timeTo,
      }
    );

    if (!response.success) {
      throw new Error("Failed to fetch OHLCV data from Birdeye");
    }

    return response.data.items.map((item) => ({
      timestamp: item.unixTime,
      open: item.o,
      high: item.h,
      low: item.l,
      close: item.c,
      volume: item.v,
    }));
  }

  /**
   * Get token transactions
   */
  async getTokenTransactions(
    address: string,
    options: {
      offset?: number;
      limit?: number;
      txType?: "swap" | "all";
    } = {},
    chain?: BirdeyeChain
  ): Promise<{ transactions: TokenTransaction[]; hasMore: boolean }> {
    const client = chain ? this.client.withChain(chain) : this.client;

    logger.info(`[Birdeye] Getting transactions for ${address}`);

    const response = await client.get<BirdeyeResponse<BirdeyeTransactionListData>>(
      "/defi/txs/token",
      {
        address,
        offset: options.offset ?? 0,
        limit: options.limit ?? 50,
        tx_type: options.txType ?? "swap",
      }
    );

    if (!response.success) {
      throw new Error("Failed to fetch transactions from Birdeye");
    }

    const transactions: TokenTransaction[] = response.data.items.map((tx: BirdeyeTokenTransaction) => ({
      signature: tx.txHash,
      blockTime: tx.blockUnixTime,
      type: "swap" as const,
      tokenAddress: address,
      amount: String(tx.from.uiAmount),
      priceUsd: tx.from.price ?? tx.from.nearestPrice,
      from: tx.owner,
      to: tx.source,
    }));

    return {
      transactions,
      hasMore: response.data.hasNext,
    };
  }

  /**
   * Get trending tokens
   */
  async getTrendingTokens(
    options: {
      offset?: number;
      limit?: number;
    } = {},
    chain?: BirdeyeChain
  ): Promise<TrendingToken[]> {
    const client = chain ? this.client.withChain(chain) : this.client;

    logger.info(`[Birdeye] Getting trending tokens`);

    const response = await client.get<BirdeyeResponse<{ items: BirdeyeTrendingToken[] }>>(
      "/defi/token_trending",
      {
        offset: options.offset ?? 0,
        limit: options.limit ?? 20,
      }
    );

    if (!response.success) {
      throw new Error("Failed to fetch trending tokens from Birdeye");
    }

    return response.data.items.map((token) => ({
      token: {
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        chainId: (chain ?? this.config.defaultChain ?? "solana") as "solana",
        logoUri: token.logoURI,
      },
      rank: token.rank,
      priceUsd: token.price,
      priceChange24h: token.priceChange24hPercent,
      volume24h: token.v24hUSD,
    }));
  }

  /**
   * Get wallet portfolio (token holdings)
   */
  async getWalletPortfolio(
    walletAddress: string,
    chain?: BirdeyeChain
  ): Promise<WalletPortfolio> {
    const client = chain ? this.client.withChain(chain) : this.client;

    logger.info(`[Birdeye] Getting portfolio for wallet ${walletAddress}`);

    const response = await client.get<BirdeyeResponse<BirdeyeWalletPortfolio>>(
      "/v1/wallet/token_list",
      { wallet: walletAddress }
    );

    if (!response.success) {
      throw new Error("Failed to fetch wallet portfolio from Birdeye");
    }

    const totalValue = response.data.totalUsd;
    const effectiveChain = chain ?? this.config.defaultChain ?? "solana";

    return {
      address: walletAddress,
      totalValueUsd: totalValue,
      holdings: response.data.items.map((item) => ({
        token: {
          address: item.address,
          symbol: item.symbol,
          name: item.name,
          decimals: item.decimals,
          chainId: effectiveChain as "solana",
          logoUri: item.logoURI,
        },
        balance: String(item.uiAmount),
        balanceUsd: item.valueUsd ?? 0,
        percentage: totalValue > 0 ? ((item.valueUsd ?? 0) / totalValue) * 100 : 0,
      })),
      lastUpdated: new Date(),
    };
  }

  /**
   * Get token security information
   */
  async getTokenSecurity(
    address: string,
    chain?: BirdeyeChain
  ): Promise<BirdeyeTokenSecurity> {
    const client = chain ? this.client.withChain(chain) : this.client;

    logger.info(`[Birdeye] Getting security info for ${address}`);

    const response = await client.get<BirdeyeResponse<BirdeyeTokenSecurity>>(
      "/defi/token_security",
      { address }
    );

    if (!response.success) {
      throw new Error("Failed to fetch token security from Birdeye");
    }

    return response.data;
  }

  /**
   * Get token creation info
   */
  async getTokenCreationInfo(
    address: string,
    chain?: BirdeyeChain
  ): Promise<BirdeyeTokenCreationInfo> {
    const client = chain ? this.client.withChain(chain) : this.client;

    logger.info(`[Birdeye] Getting creation info for ${address}`);

    const response = await client.get<BirdeyeResponse<BirdeyeTokenCreationInfo>>(
      "/defi/token_creation_info",
      { address }
    );

    if (!response.success) {
      throw new Error("Failed to fetch token creation info from Birdeye");
    }

    return response.data;
  }

  /**
   * Search tokens by keyword
   */
  async searchTokens(
    keyword: string,
    options: {
      offset?: number;
      limit?: number;
      sortBy?: "volume24hUSD" | "liquidity" | "marketcap";
      sortType?: "asc" | "desc";
    } = {},
    chain?: BirdeyeChain
  ): Promise<TokenInfo[]> {
    const client = chain ? this.client.withChain(chain) : this.client;

    logger.info(`[Birdeye] Searching tokens: "${keyword}"`);

    const response = await client.get<BirdeyeResponse<{ items: BirdeyeTokenSearchResult[] }>>(
      "/defi/v3/search",
      {
        keyword,
        offset: options.offset ?? 0,
        limit: options.limit ?? 20,
        sort_by: options.sortBy ?? "volume24hUSD",
        sort_type: options.sortType ?? "desc",
      }
    );

    if (!response.success) {
      throw new Error("Failed to search tokens from Birdeye");
    }

    const effectiveChain = chain ?? this.config.defaultChain ?? "solana";

    return response.data.items.map((item) => ({
      address: item.address,
      symbol: item.symbol,
      name: item.name,
      decimals: item.decimals,
      chainId: effectiveChain as "solana",
      logoUri: item.logoURI,
    }));
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    return this.client.healthCheck();
  }
}

// Singleton instance
let serviceInstance: BirdeyeService | null = null;

/**
 * Get or create Birdeye service singleton
 */
export function getBirdeyeService(): BirdeyeService {
  if (!serviceInstance) {
    serviceInstance = BirdeyeService.fromEnv();
  }
  return serviceInstance;
}

/**
 * Reset service instance (for testing)
 */
export function resetBirdeyeService(): void {
  serviceInstance = null;
}


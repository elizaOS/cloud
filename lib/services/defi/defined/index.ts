/**
 * Defined.fi (Codex) Service
 *
 * Provides cross-chain on-chain analytics via GraphQL including token data,
 * liquidity pools, wallet analytics, and token holder information.
 *
 * API Documentation: https://docs.defined.fi/
 */

import { logger } from "@/lib/utils/logger";
import type { TokenInfo, TokenPrice, LiquidityPool, WalletPortfolio, ChainId } from "../types";

const DEFINED_API_URL = "https://graph.defined.fi/graphql";

/**
 * Defined.fi service configuration
 */
export interface DefinedConfig {
  apiKey: string;
  timeout?: number;
}

/**
 * Defined.fi network IDs
 */
export type DefinedNetwork =
  | 1 // Ethereum
  | 10 // Optimism
  | 56 // BSC
  | 137 // Polygon
  | 250 // Fantom
  | 8453 // Base
  | 42161 // Arbitrum
  | 43114 // Avalanche
  | 1399811149 // Solana
  | 81457; // Blast

/**
 * Network name mapping
 */
const NETWORK_NAMES: Record<DefinedNetwork, ChainId> = {
  1: "ethereum",
  10: "optimism",
  56: "bsc",
  137: "polygon",
  250: "ethereum", // Fantom not in our ChainId
  8453: "base",
  42161: "arbitrum",
  43114: "avalanche",
  1399811149: "solana",
  81457: "base", // Blast not in our ChainId
};

/**
 * Defined.fi token data
 */
export interface DefinedToken {
  address: string;
  decimals: number;
  name: string;
  networkId: DefinedNetwork;
  symbol: string;
  info?: {
    imageSmallUrl?: string;
    imageLargeUrl?: string;
    circulatingSupply?: string;
    totalSupply?: string;
  };
  explorerData?: {
    blueCheckmark?: boolean;
    description?: string;
    divisor?: string;
    tokenPriceUSD?: string;
    tokenType?: string;
  };
}

/**
 * Defined.fi token with stats
 */
export interface DefinedTokenWithStats extends DefinedToken {
  stats?: {
    price?: number;
    priceChange24?: number;
    priceChange1?: number;
    priceChange4?: number;
    priceChange12?: number;
    volume24?: number;
    marketCap?: number;
    liquidity?: number;
    holders?: number;
    txnCount24?: number;
    buyCount24?: number;
    sellCount24?: number;
  };
}

/**
 * Defined.fi pair/pool data
 */
export interface DefinedPair {
  address: string;
  exchangeId: string;
  fee: number;
  networkId: DefinedNetwork;
  tickSpacing: number;
  token0: string;
  token1: string;
  createdAt: number;
  token0Data?: DefinedToken;
  token1Data?: DefinedToken;
  stats?: {
    liquidity?: number;
    volume24?: number;
    volumeChange24?: number;
    txnCount24?: number;
    priceChange24?: number;
  };
}

/**
 * Defined.fi wallet holdings
 */
export interface DefinedWalletHolding {
  tokenAddress: string;
  networkId: DefinedNetwork;
  balance: string;
  balanceUsd?: number;
  token?: DefinedToken;
}

/**
 * GraphQL response wrapper
 */
interface GraphQLResponse<T> {
  data: T;
  errors?: Array<{ message: string }>;
}

/**
 * Defined.fi Service Class
 */
export class DefinedService {
  private readonly apiKey: string;
  private readonly timeout: number;

  constructor(config: DefinedConfig) {
    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? 30000;
  }

  /**
   * Initialize service from environment variables
   */
  static fromEnv(): DefinedService {
    const apiKey = process.env.DEFINED_API_KEY;

    if (!apiKey) {
      throw new Error("DEFINED_API_KEY environment variable is required");
    }

    return new DefinedService({ apiKey });
  }

  /**
   * Execute GraphQL query
   */
  private async query<T>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(DEFINED_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: this.apiKey,
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Defined.fi API error: ${response.status}`);
      }

      const json = (await response.json()) as GraphQLResponse<T>;

      if (json.errors && json.errors.length > 0) {
        throw new Error(`Defined.fi GraphQL error: ${json.errors[0].message}`);
      }

      return json.data;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Get token by address
   */
  async getToken(
    address: string,
    networkId: DefinedNetwork
  ): Promise<DefinedTokenWithStats | null> {
    logger.info(`[Defined] Getting token: ${address} on network ${networkId}`);

    const result = await this.query<{ token: DefinedTokenWithStats | null }>(
      `
      query GetToken($address: String!, $networkId: Int!) {
        token(input: { address: $address, networkId: $networkId }) {
          address
          decimals
          name
          networkId
          symbol
          info {
            imageSmallUrl
            imageLargeUrl
            circulatingSupply
            totalSupply
          }
          explorerData {
            blueCheckmark
            description
            tokenPriceUSD
          }
        }
      }
      `,
      { address, networkId }
    );

    return result.token;
  }

  /**
   * Search tokens
   */
  async searchTokens(
    query: string,
    options: {
      networkIds?: DefinedNetwork[];
      limit?: number;
    } = {}
  ): Promise<DefinedToken[]> {
    logger.info(`[Defined] Searching tokens: "${query}"`);

    const result = await this.query<{ searchTokens: { tokens: DefinedToken[] } }>(
      `
      query SearchTokens($search: String!, $networkFilter: [Int!], $limit: Int) {
        searchTokens(
          search: $search
          networkFilter: $networkFilter
          limit: $limit
        ) {
          tokens {
            address
            decimals
            name
            networkId
            symbol
            info {
              imageSmallUrl
            }
          }
        }
      }
      `,
      {
        search: query,
        networkFilter: options.networkIds,
        limit: options.limit ?? 20,
      }
    );

    return result.searchTokens.tokens;
  }

  /**
   * Get token info (normalized)
   */
  async getTokenInfo(
    address: string,
    networkId: DefinedNetwork
  ): Promise<TokenInfo | null> {
    const token = await this.getToken(address, networkId);

    if (!token) {
      return null;
    }

    return {
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      chainId: NETWORK_NAMES[networkId] ?? "ethereum",
      logoUri: token.info?.imageSmallUrl,
    };
  }

  /**
   * Get token price
   */
  async getTokenPrice(
    address: string,
    networkId: DefinedNetwork
  ): Promise<TokenPrice> {
    logger.info(`[Defined] Getting token price: ${address}`);

    const result = await this.query<{
      getTokenPrices: Array<{
        address: string;
        networkId: number;
        priceUsd: number;
        timestamp: number;
      }>;
    }>(
      `
      query GetTokenPrice($inputs: [GetPriceInput!]!) {
        getTokenPrices(inputs: $inputs) {
          address
          networkId
          priceUsd
          timestamp
        }
      }
      `,
      { inputs: [{ address, networkId }] }
    );

    const price = result.getTokenPrices[0];

    if (!price) {
      throw new Error(`Price not found for token: ${address}`);
    }

    return {
      address: price.address,
      symbol: "",
      priceUsd: price.priceUsd,
      lastUpdated: new Date(price.timestamp * 1000),
    };
  }

  /**
   * Get token pairs/pools
   */
  async getTokenPairs(
    tokenAddress: string,
    networkId: DefinedNetwork,
    options: { limit?: number } = {}
  ): Promise<DefinedPair[]> {
    logger.info(`[Defined] Getting pairs for token: ${tokenAddress}`);

    const result = await this.query<{ listPairsForToken: DefinedPair[] }>(
      `
      query ListPairsForToken($tokenAddress: String!, $networkId: Int!, $limit: Int) {
        listPairsForToken(
          tokenAddress: $tokenAddress
          networkId: $networkId
          limit: $limit
        ) {
          address
          exchangeId
          fee
          networkId
          token0
          token1
          createdAt
        }
      }
      `,
      {
        tokenAddress,
        networkId,
        limit: options.limit ?? 20,
      }
    );

    return result.listPairsForToken;
  }

  /**
   * Get pair details with stats
   */
  async getPairDetails(
    pairAddress: string,
    networkId: DefinedNetwork
  ): Promise<DefinedPair | null> {
    logger.info(`[Defined] Getting pair details: ${pairAddress}`);

    const result = await this.query<{ pair: DefinedPair | null }>(
      `
      query GetPair($pairAddress: String!, $networkId: Int!) {
        pair(pairAddress: $pairAddress, networkId: $networkId) {
          address
          exchangeId
          fee
          networkId
          token0
          token1
          createdAt
          token0Data {
            address
            decimals
            name
            symbol
          }
          token1Data {
            address
            decimals
            name
            symbol
          }
        }
      }
      `,
      { pairAddress, networkId }
    );

    return result.pair;
  }

  /**
   * Get top tokens by volume
   */
  async getTopTokens(
    networkId: DefinedNetwork,
    options: { limit?: number; resolution?: string } = {}
  ): Promise<DefinedTokenWithStats[]> {
    logger.info(`[Defined] Getting top tokens on network ${networkId}`);

    const result = await this.query<{
      listTopTokens: { tokens: DefinedTokenWithStats[] };
    }>(
      `
      query ListTopTokens($networkId: Int!, $limit: Int, $resolution: String) {
        listTopTokens(
          networkId: $networkId
          limit: $limit
          resolution: $resolution
        ) {
          tokens {
            address
            decimals
            name
            networkId
            symbol
            info {
              imageSmallUrl
            }
          }
        }
      }
      `,
      {
        networkId,
        limit: options.limit ?? 50,
        resolution: options.resolution ?? "24h",
      }
    );

    return result.listTopTokens.tokens;
  }

  /**
   * Get new tokens/pairs
   */
  async getNewPairs(
    networkId: DefinedNetwork,
    options: { limit?: number; minLiquidity?: number } = {}
  ): Promise<DefinedPair[]> {
    logger.info(`[Defined] Getting new pairs on network ${networkId}`);

    const result = await this.query<{ getLatestPairs: DefinedPair[] }>(
      `
      query GetLatestPairs($networkId: Int!, $limit: Int, $minLiquidity: Float) {
        getLatestPairs(
          networkId: $networkId
          limit: $limit
          minLiquidity: $minLiquidity
        ) {
          address
          exchangeId
          fee
          networkId
          token0
          token1
          createdAt
          token0Data {
            address
            symbol
            name
          }
          token1Data {
            address
            symbol
            name
          }
        }
      }
      `,
      {
        networkId,
        limit: options.limit ?? 20,
        minLiquidity: options.minLiquidity,
      }
    );

    return result.getLatestPairs;
  }

  /**
   * Get token holders
   */
  async getTokenHolders(
    address: string,
    networkId: DefinedNetwork,
    options: { limit?: number; cursor?: string } = {}
  ): Promise<{
    holders: Array<{
      address: string;
      balance: string;
      share: number;
    }>;
    cursor?: string;
  }> {
    logger.info(`[Defined] Getting holders for token: ${address}`);

    const result = await this.query<{
      getTokenHolders: {
        holders: Array<{
          address: string;
          balance: string;
          share: number;
        }>;
        cursor?: string;
      };
    }>(
      `
      query GetTokenHolders($address: String!, $networkId: Int!, $limit: Int, $cursor: String) {
        getTokenHolders(
          tokenAddress: $address
          networkId: $networkId
          limit: $limit
          cursor: $cursor
        ) {
          holders {
            address
            balance
            share
          }
          cursor
        }
      }
      `,
      {
        address,
        networkId,
        limit: options.limit ?? 50,
        cursor: options.cursor,
      }
    );

    return result.getTokenHolders;
  }

  /**
   * Get supported network IDs
   */
  getSupportedNetworks(): DefinedNetwork[] {
    return [1, 10, 56, 137, 250, 8453, 42161, 43114, 1399811149, 81457];
  }

  /**
   * Convert chain ID to Defined network ID
   */
  chainIdToNetworkId(chainId: ChainId): DefinedNetwork | null {
    const mapping: Partial<Record<ChainId, DefinedNetwork>> = {
      ethereum: 1,
      optimism: 10,
      bsc: 56,
      polygon: 137,
      base: 8453,
      arbitrum: 42161,
      avalanche: 43114,
      solana: 1399811149,
    };

    return mapping[chainId] ?? null;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      await this.query<{ __typename: string }>(`{ __typename }`);
      return { healthy: true, latencyMs: Date.now() - start };
    } catch {
      return { healthy: false, latencyMs: Date.now() - start };
    }
  }
}

// Singleton instance
let serviceInstance: DefinedService | null = null;

/**
 * Get or create Defined.fi service singleton
 */
export function getDefinedService(): DefinedService {
  if (!serviceInstance) {
    serviceInstance = DefinedService.fromEnv();
  }
  return serviceInstance;
}

/**
 * Reset service instance (for testing)
 */
export function resetDefinedService(): void {
  serviceInstance = null;
}


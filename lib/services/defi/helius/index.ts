/**
 * Helius Service
 *
 * Provides enhanced Solana RPC, transaction parsing, Digital Asset Standard (DAS)
 * API for NFTs/tokens, webhooks, and priority fee estimation.
 *
 * API Documentation: https://docs.helius.dev/
 */

import { logger } from "@/lib/utils/logger";
import { HeliusClient } from "./client";
import type {
  HeliusEnhancedTransaction,
  HeliusTransactionType,
  HeliusAsset,
  HeliusWebhook,
  HeliusPriorityFeeResponse,
  HeliusTokenMetadata,
  HeliusBalance,
} from "./types";
import type { TokenTransaction, WalletPortfolio, TokenInfo } from "../types";

export * from "./types";
export * from "./schemas";

/**
 * Helius service configuration
 */
export interface HeliusConfig {
  apiKey: string;
  timeout?: number;
  devnet?: boolean;
}

/**
 * Helius Service Class
 *
 * Enhanced Solana RPC and data service.
 */
export class HeliusService {
  private readonly client: HeliusClient;
  private readonly config: HeliusConfig;

  constructor(config: HeliusConfig) {
    this.config = config;
    this.client = new HeliusClient({
      apiKey: config.apiKey,
      timeout: config.timeout,
      devnet: config.devnet,
    });
  }

  /**
   * Initialize service from environment variables
   */
  static fromEnv(): HeliusService {
    const apiKey = process.env.HELIUS_API_KEY;

    if (!apiKey) {
      throw new Error("HELIUS_API_KEY environment variable is required");
    }

    return new HeliusService({
      apiKey,
      timeout: process.env.HELIUS_TIMEOUT
        ? parseInt(process.env.HELIUS_TIMEOUT, 10)
        : undefined,
      devnet: process.env.HELIUS_DEVNET === "true",
    });
  }

  /**
   * Get RPC URL for direct connection
   */
  getRpcUrl(): string {
    return this.client.getRpcUrl();
  }

  /**
   * Parse transactions (enhanced transaction data)
   */
  async parseTransactions(
    signatures: string[]
  ): Promise<HeliusEnhancedTransaction[]> {
    logger.info(`[Helius] Parsing ${signatures.length} transactions`);

    return this.client.post<HeliusEnhancedTransaction[]>(
      "/transactions",
      { transactions: signatures }
    );
  }

  /**
   * Parse single transaction
   */
  async parseTransaction(signature: string): Promise<HeliusEnhancedTransaction> {
    const results = await this.parseTransactions([signature]);

    if (results.length === 0) {
      throw new Error(`Transaction not found: ${signature}`);
    }

    return results[0];
  }

  /**
   * Get transaction history for an address
   */
  async getTransactionHistory(
    address: string,
    options: {
      before?: string;
      until?: string;
      limit?: number;
      source?: string;
      type?: HeliusTransactionType;
    } = {}
  ): Promise<{ transactions: TokenTransaction[]; hasMore: boolean }> {
    logger.info(`[Helius] Getting transaction history for ${address}`);

    const results = await this.client.get<HeliusEnhancedTransaction[]>(
      "/addresses/" + address + "/transactions",
      {
        before: options.before,
        until: options.until,
        limit: options.limit ?? 100,
        source: options.source,
        type: options.type,
      }
    );

    const transactions: TokenTransaction[] = results.map((tx) => ({
      signature: tx.signature,
      blockTime: tx.timestamp,
      type: tx.type === "SWAP" ? "swap" : "transfer",
      tokenAddress: tx.tokenTransfers[0]?.mint ?? "",
      amount: String(tx.tokenTransfers[0]?.tokenAmount ?? 0),
      from: tx.tokenTransfers[0]?.fromUserAccount ?? tx.feePayer,
      to: tx.tokenTransfers[0]?.toUserAccount ?? "",
    }));

    return {
      transactions,
      hasMore: results.length === (options.limit ?? 100),
    };
  }

  /**
   * Get raw transaction history
   */
  async getRawTransactionHistory(
    address: string,
    options: {
      before?: string;
      until?: string;
      limit?: number;
    } = {}
  ): Promise<HeliusEnhancedTransaction[]> {
    logger.info(`[Helius] Getting raw transaction history for ${address}`);

    return this.client.get<HeliusEnhancedTransaction[]>(
      "/addresses/" + address + "/transactions",
      {
        before: options.before,
        until: options.until,
        limit: options.limit ?? 100,
      }
    );
  }

  /**
   * Get asset by ID (DAS API)
   */
  async getAsset(assetId: string): Promise<HeliusAsset> {
    logger.info(`[Helius] Getting asset: ${assetId}`);

    return this.client.rpcRequest<HeliusAsset>("getAsset", [{ id: assetId }]);
  }

  /**
   * Get assets by owner (DAS API)
   */
  async getAssetsByOwner(
    ownerAddress: string,
    options: {
      page?: number;
      limit?: number;
      showFungible?: boolean;
      showNativeBalance?: boolean;
    } = {}
  ): Promise<{ items: HeliusAsset[]; total: number; page: number }> {
    logger.info(`[Helius] Getting assets for owner: ${ownerAddress}`);

    const result = await this.client.rpcRequest<{
      items: HeliusAsset[];
      total: number;
      page: number;
    }>("getAssetsByOwner", [
      {
        ownerAddress,
        page: options.page ?? 1,
        limit: options.limit ?? 100,
        displayOptions: {
          showFungible: options.showFungible ?? true,
          showNativeBalance: options.showNativeBalance ?? true,
        },
      },
    ]);

    return result;
  }

  /**
   * Get assets by group/collection (DAS API)
   */
  async getAssetsByGroup(
    groupKey: "collection",
    groupValue: string,
    options: { page?: number; limit?: number } = {}
  ): Promise<{ items: HeliusAsset[]; total: number; page: number }> {
    logger.info(`[Helius] Getting assets by ${groupKey}: ${groupValue}`);

    return this.client.rpcRequest<{
      items: HeliusAsset[];
      total: number;
      page: number;
    }>("getAssetsByGroup", [
      {
        groupKey,
        groupValue,
        page: options.page ?? 1,
        limit: options.limit ?? 100,
      },
    ]);
  }

  /**
   * Search assets (DAS API)
   */
  async searchAssets(
    params: {
      ownerAddress?: string;
      creatorAddress?: string;
      creatorVerified?: boolean;
      compressed?: boolean;
      burnt?: boolean;
      page?: number;
      limit?: number;
    }
  ): Promise<{ items: HeliusAsset[]; total: number; page: number }> {
    logger.info("[Helius] Searching assets");

    return this.client.rpcRequest<{
      items: HeliusAsset[];
      total: number;
      page: number;
    }>("searchAssets", [params]);
  }

  /**
   * Get token metadata
   */
  async getTokenMetadata(
    mintAccounts: string[],
    options: { includeOffChain?: boolean } = {}
  ): Promise<HeliusTokenMetadata[]> {
    logger.info(`[Helius] Getting metadata for ${mintAccounts.length} tokens`);

    return this.client.post<HeliusTokenMetadata[]>("/token-metadata", {
      mintAccounts,
      includeOffChain: options.includeOffChain ?? true,
    });
  }

  /**
   * Get token info (convenience method)
   */
  async getTokenInfo(mintAddress: string): Promise<TokenInfo | null> {
    const metadata = await this.getTokenMetadata([mintAddress]);

    if (metadata.length === 0) {
      return null;
    }

    const token = metadata[0];
    const onChain = token.onChainMetadata?.metadata?.data;
    const offChain = token.offChainMetadata?.metadata;
    const legacy = token.legacyMetadata;
    const parsed = token.onChainAccountInfo?.accountInfo?.data?.parsed?.info;

    return {
      address: mintAddress,
      symbol: onChain?.symbol ?? legacy?.symbol ?? offChain?.symbol ?? "UNKNOWN",
      name: onChain?.name ?? legacy?.name ?? offChain?.name ?? "Unknown Token",
      decimals: parsed?.decimals ?? legacy?.decimals ?? 9,
      chainId: "solana",
      logoUri: legacy?.logoURI ?? offChain?.image,
    };
  }

  /**
   * Get wallet balances
   */
  async getBalances(address: string): Promise<HeliusBalance> {
    logger.info(`[Helius] Getting balances for ${address}`);

    return this.client.get<HeliusBalance>("/addresses/" + address + "/balances");
  }

  /**
   * Get wallet portfolio (normalized)
   */
  async getWalletPortfolio(address: string): Promise<WalletPortfolio> {
    const balances = await this.getBalances(address);

    // Get token metadata for all tokens
    const tokenMints = balances.tokens.map((t) => t.mint);
    const metadata =
      tokenMints.length > 0
        ? await this.getTokenMetadata(tokenMints)
        : [];

    const metadataMap = new Map(metadata.map((m) => [m.mint, m]));
    const totalValue = balances.nativeBalance / 1e9; // TODO: Add USD value

    return {
      address,
      totalValueUsd: totalValue,
      holdings: balances.tokens.map((token) => {
        const meta = metadataMap.get(token.mint);
        const onChain = meta?.onChainMetadata?.metadata?.data;
        const legacy = meta?.legacyMetadata;

        return {
          token: {
            address: token.mint,
            symbol: onChain?.symbol ?? legacy?.symbol ?? "UNKNOWN",
            name: onChain?.name ?? legacy?.name ?? "Unknown Token",
            decimals: token.decimals,
            chainId: "solana" as const,
            logoUri: legacy?.logoURI,
          },
          balance: String(token.amount / Math.pow(10, token.decimals)),
          balanceUsd: 0, // TODO: Add USD value
          percentage: 0,
        };
      }),
      lastUpdated: new Date(),
    };
  }

  /**
   * Get priority fee estimate
   */
  async getPriorityFee(
    accountKeys?: string[],
    options?: { recommended?: boolean }
  ): Promise<HeliusPriorityFeeResponse> {
    logger.info("[Helius] Getting priority fee estimate");

    return this.client.rpcRequest<HeliusPriorityFeeResponse>("getPriorityFeeEstimate", [
      {
        accountKeys,
        options: {
          includeAllPriorityFeeLevels: true,
          recommended: options?.recommended ?? true,
        },
      },
    ]);
  }

  /**
   * Create webhook
   */
  async createWebhook(
    webhookURL: string,
    accountAddresses: string[],
    transactionTypes: HeliusTransactionType[],
    options: {
      webhookType?: "enhanced" | "raw" | "discord";
      txnStatus?: "all" | "success" | "failed";
      authHeader?: string;
    } = {}
  ): Promise<HeliusWebhook> {
    logger.info(`[Helius] Creating webhook for ${accountAddresses.length} addresses`);

    return this.client.post<HeliusWebhook>("/webhooks", {
      webhookURL,
      transactionTypes,
      accountAddresses,
      webhookType: options.webhookType ?? "enhanced",
      txnStatus: options.txnStatus,
      authHeader: options.authHeader,
    });
  }

  /**
   * Get all webhooks
   */
  async getWebhooks(): Promise<HeliusWebhook[]> {
    logger.info("[Helius] Getting all webhooks");

    return this.client.get<HeliusWebhook[]>("/webhooks");
  }

  /**
   * Delete webhook
   */
  async deleteWebhook(webhookId: string): Promise<void> {
    logger.info(`[Helius] Deleting webhook: ${webhookId}`);

    await this.client.request(`/webhooks/${webhookId}`, { method: "DELETE" });
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    return this.client.healthCheck();
  }
}

// Singleton instance
let serviceInstance: HeliusService | null = null;

/**
 * Get or create Helius service singleton
 */
export function getHeliusService(): HeliusService {
  if (!serviceInstance) {
    serviceInstance = HeliusService.fromEnv();
  }
  return serviceInstance;
}

/**
 * Reset service instance (for testing)
 */
export function resetHeliusService(): void {
  serviceInstance = null;
}


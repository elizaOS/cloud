/**
 * Helius Service - Enhanced Solana RPC and DAS API
 * API: https://docs.helius.dev/
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

export interface HeliusConfig {
  apiKey: string;
  timeout?: number;
  devnet?: boolean;
}

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

  static fromEnv(): HeliusService {
    const apiKey = process.env.HELIUS_API_KEY;
    if (!apiKey)
      throw new Error("HELIUS_API_KEY environment variable is required");

    return new HeliusService({
      apiKey,
      timeout: process.env.HELIUS_TIMEOUT
        ? parseInt(process.env.HELIUS_TIMEOUT, 10)
        : undefined,
      devnet: process.env.HELIUS_DEVNET === "true",
    });
  }

  getRpcUrl(): string {
    return this.client.getRpcUrl();
  }

  async parseTransactions(
    signatures: string[],
  ): Promise<HeliusEnhancedTransaction[]> {
    logger.info(`[Helius] Parsing ${signatures.length} transactions`);
    return this.client.post<HeliusEnhancedTransaction[]>("/transactions", {
      transactions: signatures,
    });
  }

  async parseTransaction(
    signature: string,
  ): Promise<HeliusEnhancedTransaction> {
    const results = await this.parseTransactions([signature]);
    if (results.length === 0)
      throw new Error(`Transaction not found: ${signature}`);
    return results[0];
  }

  async getTransactionHistory(
    address: string,
    options: {
      before?: string;
      until?: string;
      limit?: number;
      source?: string;
      type?: HeliusTransactionType;
    } = {},
  ): Promise<{ transactions: TokenTransaction[]; hasMore: boolean }> {
    logger.info(`[Helius] Getting transaction history for ${address}`);

    const results = await this.client.get<HeliusEnhancedTransaction[]>(
      `/addresses/${address}/transactions`,
      {
        before: options.before,
        until: options.until,
        limit: options.limit ?? 100,
        source: options.source,
        type: options.type,
      },
    );

    return {
      transactions: results.map((tx) => ({
        signature: tx.signature,
        blockTime: tx.timestamp,
        type: tx.type === "SWAP" ? "swap" : "transfer",
        tokenAddress: tx.tokenTransfers[0]?.mint ?? "",
        amount: String(tx.tokenTransfers[0]?.tokenAmount ?? 0),
        from: tx.tokenTransfers[0]?.fromUserAccount ?? tx.feePayer,
        to: tx.tokenTransfers[0]?.toUserAccount ?? "",
      })),
      hasMore: results.length === (options.limit ?? 100),
    };
  }

  async getRawTransactionHistory(
    address: string,
    options: { before?: string; until?: string; limit?: number } = {},
  ): Promise<HeliusEnhancedTransaction[]> {
    logger.info(`[Helius] Getting raw transaction history for ${address}`);
    return this.client.get<HeliusEnhancedTransaction[]>(
      `/addresses/${address}/transactions`,
      {
        before: options.before,
        until: options.until,
        limit: options.limit ?? 100,
      },
    );
  }

  async getAsset(assetId: string): Promise<HeliusAsset> {
    logger.info(`[Helius] Getting asset: ${assetId}`);
    return this.client.rpcRequest<HeliusAsset>("getAsset", [{ id: assetId }]);
  }

  async getAssetsByOwner(
    ownerAddress: string,
    options: {
      page?: number;
      limit?: number;
      showFungible?: boolean;
      showNativeBalance?: boolean;
    } = {},
  ): Promise<{ items: HeliusAsset[]; total: number; page: number }> {
    logger.info(`[Helius] Getting assets for owner: ${ownerAddress}`);

    return this.client.rpcRequest<{
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
  }

  async getAssetsByGroup(
    groupKey: "collection",
    groupValue: string,
    options: { page?: number; limit?: number } = {},
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

  async searchAssets(params: {
    ownerAddress?: string;
    creatorAddress?: string;
    creatorVerified?: boolean;
    compressed?: boolean;
    burnt?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{ items: HeliusAsset[]; total: number; page: number }> {
    logger.info("[Helius] Searching assets");
    return this.client.rpcRequest<{
      items: HeliusAsset[];
      total: number;
      page: number;
    }>("searchAssets", [params]);
  }

  async getTokenMetadata(
    mintAccounts: string[],
    options: { includeOffChain?: boolean } = {},
  ): Promise<HeliusTokenMetadata[]> {
    logger.info(`[Helius] Getting metadata for ${mintAccounts.length} tokens`);
    return this.client.post<HeliusTokenMetadata[]>("/token-metadata", {
      mintAccounts,
      includeOffChain: options.includeOffChain ?? true,
    });
  }

  async getTokenInfo(mintAddress: string): Promise<TokenInfo | null> {
    const metadata = await this.getTokenMetadata([mintAddress]);
    if (metadata.length === 0) return null;

    const token = metadata[0];
    const onChain = token.onChainMetadata?.metadata?.data;
    const offChain = token.offChainMetadata?.metadata;
    const legacy = token.legacyMetadata;
    const parsed = token.onChainAccountInfo?.accountInfo?.data?.parsed?.info;

    return {
      address: mintAddress,
      symbol:
        onChain?.symbol ?? legacy?.symbol ?? offChain?.symbol ?? "UNKNOWN",
      name: onChain?.name ?? legacy?.name ?? offChain?.name ?? "Unknown Token",
      decimals: parsed?.decimals ?? legacy?.decimals ?? 9,
      chainId: "solana",
      logoUri: legacy?.logoURI ?? offChain?.image,
    };
  }

  async getBalances(address: string): Promise<HeliusBalance> {
    logger.info(`[Helius] Getting balances for ${address}`);
    return this.client.get<HeliusBalance>(`/addresses/${address}/balances`);
  }

  async getWalletPortfolio(
    address: string,
    options: { includePrices?: boolean } = {},
  ): Promise<WalletPortfolio> {
    const balances = await this.getBalances(address);
    const tokenMints = balances.tokens.map((t) => t.mint);
    const metadata =
      tokenMints.length > 0 ? await this.getTokenMetadata(tokenMints) : [];
    const metadataMap = new Map(metadata.map((m) => [m.mint, m]));

    // Optionally fetch prices from Birdeye
    let priceMap = new Map<string, number>();
    if (options.includePrices && tokenMints.length > 0) {
      try {
        const { getBirdeyeService } = await import("../birdeye");
        const birdeye = getBirdeyeService();
        const prices = await birdeye.getMultiPrice(tokenMints);
        priceMap = new Map(
          [...prices.entries()].map(([k, v]) => [k, v.priceUsd]),
        );
      } catch {
        // Birdeye unavailable, continue without prices
      }
    }

    const holdings = balances.tokens.map((token) => {
      const meta = metadataMap.get(token.mint);
      const onChain = meta?.onChainMetadata?.metadata?.data;
      const legacy = meta?.legacyMetadata;
      const balance = token.amount / Math.pow(10, token.decimals);
      const priceUsd = priceMap.get(token.mint) ?? 0;
      const balanceUsd = balance * priceUsd;

      return {
        token: {
          address: token.mint,
          symbol: onChain?.symbol ?? legacy?.symbol ?? "UNKNOWN",
          name: onChain?.name ?? legacy?.name ?? "Unknown Token",
          decimals: token.decimals,
          chainId: "solana" as const,
          logoUri: legacy?.logoURI,
        },
        balance: String(balance),
        balanceUsd,
        percentage: 0, // Calculated below
      };
    });

    const totalValueUsd =
      holdings.reduce((sum, h) => sum + h.balanceUsd, 0) +
      (balances.nativeBalance / 1e9) *
        (priceMap.get("So11111111111111111111111111111111111111112") ?? 0);

    // Calculate percentages
    holdings.forEach((h) => {
      h.percentage =
        totalValueUsd > 0 ? (h.balanceUsd / totalValueUsd) * 100 : 0;
    });

    return { address, totalValueUsd, holdings, lastUpdated: new Date() };
  }

  async getPriorityFee(
    accountKeys?: string[],
    options?: { recommended?: boolean },
  ): Promise<HeliusPriorityFeeResponse> {
    logger.info("[Helius] Getting priority fee estimate");
    return this.client.rpcRequest<HeliusPriorityFeeResponse>(
      "getPriorityFeeEstimate",
      [
        {
          accountKeys,
          options: {
            includeAllPriorityFeeLevels: true,
            recommended: options?.recommended ?? true,
          },
        },
      ],
    );
  }

  async createWebhook(
    webhookURL: string,
    accountAddresses: string[],
    transactionTypes: HeliusTransactionType[],
    options: {
      webhookType?: "enhanced" | "raw" | "discord";
      txnStatus?: "all" | "success" | "failed";
      authHeader?: string;
    } = {},
  ): Promise<HeliusWebhook> {
    logger.info(
      `[Helius] Creating webhook for ${accountAddresses.length} addresses`,
    );
    return this.client.post<HeliusWebhook>("/webhooks", {
      webhookURL,
      transactionTypes,
      accountAddresses,
      webhookType: options.webhookType ?? "enhanced",
      txnStatus: options.txnStatus,
      authHeader: options.authHeader,
    });
  }

  async getWebhooks(): Promise<HeliusWebhook[]> {
    logger.info("[Helius] Getting all webhooks");
    return this.client.get<HeliusWebhook[]>("/webhooks");
  }

  async deleteWebhook(webhookId: string): Promise<void> {
    logger.info(`[Helius] Deleting webhook: ${webhookId}`);
    await this.client.request(`/webhooks/${webhookId}`, { method: "DELETE" });
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    return this.client.healthCheck();
  }
}

let serviceInstance: HeliusService | null = null;

export function getHeliusService(): HeliusService {
  if (!serviceInstance) serviceInstance = HeliusService.fromEnv();
  return serviceInstance;
}

export function resetHeliusService(): void {
  serviceInstance = null;
}

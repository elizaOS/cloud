/**
 * Jupiter Service - Solana DEX aggregation
 * API: https://station.jup.ag/docs/apis/swap-api
 */

import { logger } from "@/lib/utils/logger";
import { JupiterClient } from "./client";
import type {
  JupiterQuoteResponse,
  JupiterSwapRequest,
  JupiterSwapResponse,
  JupiterPriceResponse,
  JupiterTokenInfo,
  JupiterQuoteParams,
  JupiterSwapInstructionsResponse,
} from "./types";
import type { SwapQuote, SwapRoute, TokenInfo, TokenPrice } from "../types";

export * from "./types";
export * from "./schemas";

export interface JupiterConfig {
  apiKey?: string;
  timeout?: number;
  defaultSlippageBps?: number;
}

export class JupiterService {
  private readonly client: JupiterClient;
  private readonly config: JupiterConfig;
  private tokenListCache: JupiterTokenInfo[] | null = null;
  private tokenListCacheTime: number = 0;
  private readonly TOKEN_CACHE_TTL = 3600000; // 1 hour

  constructor(config: JupiterConfig = {}) {
    this.config = config;
    this.client = new JupiterClient({ apiKey: config.apiKey, timeout: config.timeout });
  }

  static fromEnv(): JupiterService {
    return new JupiterService({
      apiKey: process.env.JUPITER_API_KEY,
      timeout: process.env.JUPITER_TIMEOUT ? parseInt(process.env.JUPITER_TIMEOUT, 10) : undefined,
      defaultSlippageBps: process.env.JUPITER_DEFAULT_SLIPPAGE_BPS
        ? parseInt(process.env.JUPITER_DEFAULT_SLIPPAGE_BPS, 10)
        : 50,
    });
  }

  async getQuote(params: JupiterQuoteParams): Promise<SwapQuote> {
    logger.info(`[Jupiter] Getting quote: ${params.inputMint} -> ${params.outputMint}`);

    const response = await this.client.get<JupiterQuoteResponse>("/quote", {
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      amount: params.amount,
      slippageBps: params.slippageBps ?? this.config.defaultSlippageBps ?? 50,
      swapMode: params.swapMode ?? "ExactIn",
      onlyDirectRoutes: params.onlyDirectRoutes,
      asLegacyTransaction: params.asLegacyTransaction,
      maxAccounts: params.maxAccounts,
      excludeDexes: params.excludeDexes?.join(","),
      autoSlippage: params.autoSlippage,
      maxAutoSlippageBps: params.maxAutoSlippageBps,
    });

    const [inputToken, outputToken] = await Promise.all([
      this.getTokenInfo(params.inputMint),
      this.getTokenInfo(params.outputMint),
    ]);

    const routes: SwapRoute[] = response.routePlan.map((step) => ({
      protocol: step.swapInfo.label,
      inputToken: step.swapInfo.inputMint,
      outputToken: step.swapInfo.outputMint,
      portion: step.percent / 100,
    }));

    return {
      inputToken: inputToken ?? { address: params.inputMint, symbol: "UNKNOWN", name: "Unknown Token", decimals: 9, chainId: "solana" },
      outputToken: outputToken ?? { address: params.outputMint, symbol: "UNKNOWN", name: "Unknown Token", decimals: 9, chainId: "solana" },
      inputAmount: response.inAmount,
      outputAmount: response.outAmount,
      priceImpactPercent: parseFloat(response.priceImpactPct),
      routes,
      fee: response.platformFee ? { amount: response.platformFee.amount, token: params.inputMint } : undefined,
    };
  }

  async getRawQuote(params: JupiterQuoteParams): Promise<JupiterQuoteResponse> {
    logger.info(`[Jupiter] Getting raw quote: ${params.inputMint} -> ${params.outputMint}`);

    return this.client.get<JupiterQuoteResponse>("/quote", {
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      amount: params.amount,
      slippageBps: params.slippageBps ?? this.config.defaultSlippageBps ?? 50,
      swapMode: params.swapMode ?? "ExactIn",
      onlyDirectRoutes: params.onlyDirectRoutes,
      asLegacyTransaction: params.asLegacyTransaction,
      maxAccounts: params.maxAccounts,
      excludeDexes: params.excludeDexes?.join(","),
      autoSlippage: params.autoSlippage,
      maxAutoSlippageBps: params.maxAutoSlippageBps,
    });
  }

  async getSwapTransaction(
    quoteResponse: JupiterQuoteResponse,
    userPublicKey: string,
    options: Partial<JupiterSwapRequest> = {}
  ): Promise<JupiterSwapResponse> {
    logger.info(`[Jupiter] Building swap transaction for ${userPublicKey}`);

    return this.client.post<JupiterSwapResponse>("/swap", {
      quoteResponse,
      userPublicKey,
      wrapAndUnwrapSol: options.wrapAndUnwrapSol ?? true,
      useSharedAccounts: options.useSharedAccounts ?? true,
      computeUnitPriceMicroLamports: options.computeUnitPriceMicroLamports,
      prioritizationFeeLamports: options.prioritizationFeeLamports ?? "auto",
      asLegacyTransaction: options.asLegacyTransaction ?? false,
      dynamicComputeUnitLimit: options.dynamicComputeUnitLimit ?? true,
      dynamicSlippage: options.dynamicSlippage,
    } as Record<string, unknown>);
  }

  async getSwapInstructions(
    quoteResponse: JupiterQuoteResponse,
    userPublicKey: string,
    options: Partial<JupiterSwapRequest> = {}
  ): Promise<JupiterSwapInstructionsResponse> {
    logger.info(`[Jupiter] Getting swap instructions for ${userPublicKey}`);

    return this.client.post<JupiterSwapInstructionsResponse>("/swap-instructions", {
      quoteResponse,
      userPublicKey,
      wrapAndUnwrapSol: options.wrapAndUnwrapSol ?? true,
      useSharedAccounts: options.useSharedAccounts ?? true,
      computeUnitPriceMicroLamports: options.computeUnitPriceMicroLamports,
      prioritizationFeeLamports: options.prioritizationFeeLamports ?? "auto",
      asLegacyTransaction: options.asLegacyTransaction ?? false,
      dynamicComputeUnitLimit: options.dynamicComputeUnitLimit ?? true,
    } as Record<string, unknown>);
  }

  async getTokenPrices(tokenAddresses: string[], vsToken?: string): Promise<Map<string, TokenPrice>> {
    logger.info(`[Jupiter] Getting prices for ${tokenAddresses.length} tokens`);

    const response = await this.client.priceRequest<JupiterPriceResponse>("/price", {
      ids: tokenAddresses.join(","),
      vsToken,
      showExtraInfo: true,
    });

    const prices = new Map<string, TokenPrice>();
    for (const [address, data] of Object.entries(response.data)) {
      prices.set(address, { address, symbol: "", priceUsd: parseFloat(data.price), lastUpdated: new Date() });
    }
    return prices;
  }

  async getTokenPrice(tokenAddress: string): Promise<TokenPrice> {
    const prices = await this.getTokenPrices([tokenAddress]);
    const price = prices.get(tokenAddress);
    if (!price) throw new Error(`Price not found for token: ${tokenAddress}`);
    return price;
  }

  async getTokenList(): Promise<JupiterTokenInfo[]> {
    if (this.tokenListCache && Date.now() - this.tokenListCacheTime < this.TOKEN_CACHE_TTL) {
      return this.tokenListCache;
    }

    logger.info("[Jupiter] Fetching token list");
    const tokens = await this.client.tokenRequest<JupiterTokenInfo[]>("/tokens");
    this.tokenListCache = tokens;
    this.tokenListCacheTime = Date.now();
    return tokens;
  }

  async getStrictTokenList(): Promise<JupiterTokenInfo[]> {
    logger.info("[Jupiter] Fetching strict token list");
    const allTokens = await this.getTokenList();
    // Filter to verified tokens only (those with "verified" or "community" tags, excluding "unknown")
    return allTokens.filter((t) => t.tags?.includes("verified") || t.tags?.includes("community"));
  }

  async getTokenInfo(address: string): Promise<TokenInfo | null> {
    const tokens = await this.getTokenList();
    const token = tokens.find((t) => t.address === address);
    if (!token) return null;

    return {
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      chainId: "solana",
      logoUri: token.logoURI,
    };
  }

  async searchTokens(query: string): Promise<TokenInfo[]> {
    const tokens = await this.getTokenList();
    const lowerQuery = query.toLowerCase();

    return tokens
      .filter((t) => t.symbol.toLowerCase().includes(lowerQuery) || t.name.toLowerCase().includes(lowerQuery) || t.address.toLowerCase() === lowerQuery)
      .slice(0, 50)
      .map((token) => ({
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        chainId: "solana" as const,
        logoUri: token.logoURI,
      }));
  }

  async getAvailableDexes(): Promise<string[]> {
    logger.info("[Jupiter] Getting available DEXs");
    const response = await this.client.get<Record<string, string>>("/program-id-to-label");
    return Object.values(response);
  }

  calculateMinimumOutput(outputAmount: string, slippageBps: number): string {
    const amount = BigInt(outputAmount);
    const slippageMultiplier = BigInt(10000 - slippageBps);
    return ((amount * slippageMultiplier) / BigInt(10000)).toString();
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    return this.client.healthCheck();
  }
}

let serviceInstance: JupiterService | null = null;

export function getJupiterService(): JupiterService {
  if (!serviceInstance) serviceInstance = JupiterService.fromEnv();
  return serviceInstance;
}

export function resetJupiterService(): void {
  serviceInstance = null;
}

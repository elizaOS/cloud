/**
 * 0x (ZeroEx) Service - Multi-chain DEX aggregation for EVM chains
 * API: https://0x.org/docs/api
 */

import { logger } from "@/lib/utils/logger";
import { BaseHttpClient } from "../base-client";
import type { SwapQuote, SwapRoute, SwapTransaction, ChainId } from "../types";

export type ZeroExChain =
  | "ethereum"
  | "polygon"
  | "bsc"
  | "arbitrum"
  | "optimism"
  | "base"
  | "avalanche"
  | "fantom"
  | "celo"
  | "linea"
  | "scroll"
  | "blast";

const CHAIN_IDS: Record<ZeroExChain, number> = {
  ethereum: 1,
  polygon: 137,
  bsc: 56,
  arbitrum: 42161,
  optimism: 10,
  base: 8453,
  avalanche: 43114,
  fantom: 250,
  celo: 42220,
  linea: 59144,
  scroll: 534352,
  blast: 81457,
};

const API_URLS: Record<ZeroExChain, string> = {
  ethereum: "https://api.0x.org",
  polygon: "https://polygon.api.0x.org",
  bsc: "https://bsc.api.0x.org",
  arbitrum: "https://arbitrum.api.0x.org",
  optimism: "https://optimism.api.0x.org",
  base: "https://base.api.0x.org",
  avalanche: "https://avalanche.api.0x.org",
  fantom: "https://fantom.api.0x.org",
  celo: "https://celo.api.0x.org",
  linea: "https://linea.api.0x.org",
  scroll: "https://scroll.api.0x.org",
  blast: "https://blast.api.0x.org",
};

export interface ZeroExConfig {
  apiKey: string;
  defaultChain?: ZeroExChain;
  timeout?: number;
}

export interface ZeroExQuoteResponse {
  chainId: number;
  price: string;
  guaranteedPrice: string;
  estimatedPriceImpact: string;
  to: string;
  data: string;
  value: string;
  gas: string;
  estimatedGas: string;
  gasPrice: string;
  protocolFee: string;
  minimumProtocolFee: string;
  buyTokenAddress: string;
  sellTokenAddress: string;
  buyAmount: string;
  sellAmount: string;
  sources: Array<{ name: string; proportion: string }>;
  orders: Array<{
    type: number;
    source: string;
    makerToken: string;
    takerToken: string;
    makerAmount: string;
    takerAmount: string;
    fillData: Record<string, unknown>;
    fill: {
      input: string;
      output: string;
      adjustedOutput: string;
      gas: number;
    };
  }>;
  allowanceTarget: string;
  decodedUniqueId: string;
  sellTokenToEthRate: string;
  buyTokenToEthRate: string;
  expectedSlippage: string | null;
  transaction?: {
    to: string;
    data: string;
    value: string;
    gas: string;
    gasPrice: string;
  };
  permit2?: { type: string; hash: string; eip712: Record<string, unknown> };
  route?: {
    fills: Array<{
      from: string;
      to: string;
      source: string;
      proportionBps: string;
    }>;
    tokens: Array<{ address: string; symbol: string }>;
  };
}

export interface ZeroExPriceResponse {
  chainId: number;
  price: string;
  estimatedPriceImpact: string;
  buyTokenAddress: string;
  buyAmount: string;
  sellTokenAddress: string;
  sellAmount: string;
  sources: Array<{ name: string; proportion: string }>;
  estimatedGas: string;
  gasPrice: string;
  sellTokenToEthRate: string;
  buyTokenToEthRate: string;
  expectedSlippage: string | null;
  allowanceTarget: string;
}

export interface ZeroExSourcesResponse {
  records: Array<{ name: string }>;
}

class ZeroExClient extends BaseHttpClient {
  private readonly chainId: number;

  constructor(
    config: { apiKey: string; timeout?: number },
    chain: ZeroExChain,
  ) {
    super(
      {
        baseUrl: API_URLS[chain],
        apiKey: config.apiKey,
        headers: { "0x-api-key": config.apiKey },
        timeout: config.timeout,
      },
      "0x",
    );
    this.chainId = CHAIN_IDS[chain];
  }

  getChainId(): number {
    return this.chainId;
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      // Use permit2 sources endpoint (v1 is deprecated)
      await this.get("/swap/permit2/sources", { chainId: this.chainId });
      return { healthy: true, latencyMs: Date.now() - start };
    } catch {
      return { healthy: false, latencyMs: Date.now() - start };
    }
  }
}

export class ZeroExService {
  private readonly config: ZeroExConfig;
  private readonly clients: Map<ZeroExChain, ZeroExClient> = new Map();

  constructor(config: ZeroExConfig) {
    this.config = config;
  }

  static fromEnv(): ZeroExService {
    const apiKey = process.env.ZEROEX_API_KEY;
    if (!apiKey)
      throw new Error("ZEROEX_API_KEY environment variable is required");
    return new ZeroExService({
      apiKey,
      defaultChain:
        (process.env.ZEROEX_DEFAULT_CHAIN as ZeroExChain) ?? "ethereum",
    });
  }

  private getClient(chain?: ZeroExChain): ZeroExClient {
    const targetChain = chain ?? this.config.defaultChain ?? "ethereum";
    let client = this.clients.get(targetChain);
    if (!client) {
      client = new ZeroExClient(
        { apiKey: this.config.apiKey, timeout: this.config.timeout },
        targetChain,
      );
      this.clients.set(targetChain, client);
    }
    return client;
  }

  async getQuote(
    params: {
      sellToken: string;
      buyToken: string;
      sellAmount?: string;
      buyAmount?: string;
      takerAddress?: string;
      slippagePercentage?: number;
      excludedSources?: string[];
      includedSources?: string[];
      skipValidation?: boolean;
      feeRecipient?: string;
      buyTokenPercentageFee?: number;
      enableSlippageProtection?: boolean;
    },
    chain?: ZeroExChain,
  ): Promise<SwapQuote> {
    const client = this.getClient(chain);
    const effectiveChain = chain ?? this.config.defaultChain ?? "ethereum";

    logger.info(
      `[0x] Getting quote on ${effectiveChain}: ${params.sellToken} -> ${params.buyToken}`,
    );

    const response = await client.get<ZeroExQuoteResponse>(
      "/swap/permit2/quote",
      {
        chainId: CHAIN_IDS[effectiveChain],
        sellToken: params.sellToken,
        buyToken: params.buyToken,
        sellAmount: params.sellAmount,
        buyAmount: params.buyAmount,
        taker: params.takerAddress,
        slippageBps: Math.round((params.slippagePercentage ?? 0.01) * 10000),
        excludedSources: params.excludedSources?.join(","),
        includedSources: params.includedSources?.join(","),
        skipValidation: params.skipValidation,
      },
    );

    const routes: SwapRoute[] = response.sources
      .filter((s) => parseFloat(s.proportion) > 0)
      .map((source) => ({
        protocol: source.name,
        inputToken: params.sellToken,
        outputToken: params.buyToken,
        portion: parseFloat(source.proportion),
      }));

    return {
      inputToken: {
        address: response.sellTokenAddress,
        symbol: "",
        name: "",
        decimals: 18,
        chainId: effectiveChain as ChainId,
      },
      outputToken: {
        address: response.buyTokenAddress,
        symbol: "",
        name: "",
        decimals: 18,
        chainId: effectiveChain as ChainId,
      },
      inputAmount: response.sellAmount,
      outputAmount: response.buyAmount,
      priceImpactPercent: parseFloat(response.estimatedPriceImpact || "0"),
      routes,
      estimatedGas: response.estimatedGas,
      fee:
        response.protocolFee !== "0"
          ? { amount: response.protocolFee, token: "ETH" }
          : undefined,
    };
  }

  async getRawQuote(
    params: {
      sellToken: string;
      buyToken: string;
      sellAmount?: string;
      buyAmount?: string;
      takerAddress: string;
      slippagePercentage?: number;
    },
    chain?: ZeroExChain,
  ): Promise<ZeroExQuoteResponse> {
    const client = this.getClient(chain);
    const effectiveChain = chain ?? this.config.defaultChain ?? "ethereum";
    logger.info(
      `[0x] Getting raw quote on ${effectiveChain}: ${params.sellToken} -> ${params.buyToken}`,
    );

    return client.get<ZeroExQuoteResponse>("/swap/permit2/quote", {
      chainId: CHAIN_IDS[effectiveChain],
      sellToken: params.sellToken,
      buyToken: params.buyToken,
      sellAmount: params.sellAmount,
      buyAmount: params.buyAmount,
      taker: params.takerAddress,
      slippageBps: Math.round((params.slippagePercentage ?? 0.01) * 10000),
    });
  }

  async getPrice(
    params: {
      sellToken: string;
      buyToken: string;
      sellAmount?: string;
      buyAmount?: string;
    },
    chain?: ZeroExChain,
  ): Promise<ZeroExPriceResponse> {
    const client = this.getClient(chain);
    const effectiveChain = chain ?? this.config.defaultChain ?? "ethereum";
    logger.info(
      `[0x] Getting price on ${effectiveChain}: ${params.sellToken} -> ${params.buyToken}`,
    );

    return client.get<ZeroExPriceResponse>("/swap/permit2/price", {
      chainId: CHAIN_IDS[effectiveChain],
      sellToken: params.sellToken,
      buyToken: params.buyToken,
      sellAmount: params.sellAmount,
      buyAmount: params.buyAmount,
    });
  }

  buildSwapTransaction(quote: ZeroExQuoteResponse): SwapTransaction {
    return {
      to: quote.to,
      data: quote.data,
      value: quote.value,
      gasLimit: quote.gas,
      chainId: quote.chainId,
    };
  }

  async getSources(chain?: ZeroExChain): Promise<string[]> {
    const client = this.getClient(chain);
    const effectiveChain = chain ?? this.config.defaultChain ?? "ethereum";
    logger.info("[0x] Getting available sources");
    const response = await client.get<ZeroExSourcesResponse>(
      "/swap/permit2/sources",
      { chainId: CHAIN_IDS[effectiveChain] },
    );
    return response.records.map((r) => r.name);
  }

  // Exchange Proxy address is the same across most EVM chains
  getAllowanceTarget(_chain?: ZeroExChain): string {
    return "0xdef1c0ded9bec7f1a1670819833240f027b25eff";
  }

  getChainId(chain: ZeroExChain): number {
    return CHAIN_IDS[chain];
  }

  getSupportedChains(): ZeroExChain[] {
    return Object.keys(CHAIN_IDS) as ZeroExChain[];
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    return this.getClient().healthCheck();
  }
}

let serviceInstance: ZeroExService | null = null;

export function getZeroExService(): ZeroExService {
  if (!serviceInstance) serviceInstance = ZeroExService.fromEnv();
  return serviceInstance;
}

export function resetZeroExService(): void {
  serviceInstance = null;
}

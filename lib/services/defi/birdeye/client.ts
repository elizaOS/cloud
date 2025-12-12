/**
 * Birdeye HTTP Client
 *
 * Specialized HTTP client for Birdeye API with proper authentication
 * and chain-specific handling.
 */

import { BaseHttpClient, type HttpClientConfig } from "../base-client";
import type { BirdeyeChain } from "./types";

const BIRDEYE_BASE_URL = "https://public-api.birdeye.so";

/**
 * Birdeye-specific HTTP client
 */
export class BirdeyeClient extends BaseHttpClient {
  private readonly chain: BirdeyeChain;

  constructor(
    config: Omit<HttpClientConfig, "baseUrl" | "headers">,
    chain: BirdeyeChain = "solana"
  ) {
    super(
      {
        ...config,
        baseUrl: BIRDEYE_BASE_URL,
        headers: {
          "X-API-KEY": config.apiKey,
          "x-chain": chain,
        },
      },
      "Birdeye"
    );
    this.chain = chain;
  }

  /**
   * Switch chain for subsequent requests
   */
  withChain(chain: BirdeyeChain): BirdeyeClient {
    return new BirdeyeClient({ apiKey: this.apiKey, timeout: this.timeout }, chain);
  }

  /**
   * Get current chain
   */
  getChain(): BirdeyeChain {
    return this.chain;
  }

  /**
   * Override request to add chain header dynamically
   */
  async request<T>(
    endpoint: string,
    options: Parameters<BaseHttpClient["request"]>[1] = {}
  ): Promise<T> {
    return super.request<T>(endpoint, {
      ...options,
      headers: {
        ...options.headers,
        "x-chain": this.chain,
      },
    });
  }

  /**
   * Health check for Birdeye - check token price endpoint
   */
  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      // Use SOL token address for health check
      await this.get("/defi/price", {
        address: "So11111111111111111111111111111111111111112",
      });
      return { healthy: true, latencyMs: Date.now() - start };
    } catch {
      return { healthy: false, latencyMs: Date.now() - start };
    }
  }
}


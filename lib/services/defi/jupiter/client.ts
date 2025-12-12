/**
 * Jupiter HTTP Client
 *
 * Specialized HTTP client for Jupiter DEX aggregator API.
 */

import { BaseHttpClient } from "../base-client";

// Jupiter migrated to new API domains in 2024
const JUPITER_API_URL = "https://public.jupiterapi.com";
const JUPITER_PRICE_API_URL = "https://api.jup.ag/price/v2";
const JUPITER_TOKEN_API_URL = "https://cache.jup.ag";

/**
 * Jupiter-specific HTTP client
 */
export class JupiterClient extends BaseHttpClient {
  private readonly priceApiUrl: string;
  private readonly tokenApiUrl: string;

  constructor(config: { apiKey?: string; timeout?: number }) {
    super(
      {
        baseUrl: JUPITER_API_URL,
        apiKey: config.apiKey ?? "",
        headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
        timeout: config.timeout,
      },
      "Jupiter"
    );
    this.priceApiUrl = JUPITER_PRICE_API_URL;
    this.tokenApiUrl = JUPITER_TOKEN_API_URL;
  }

  /**
   * Make request to price API
   */
  async priceRequest<T>(
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    const url = new URL(`${this.priceApiUrl}${endpoint}`);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Jupiter price API error: ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Make request to token API
   */
  async tokenRequest<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.tokenApiUrl}${endpoint}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Jupiter token API error: ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Health check for Jupiter - ping quote endpoint
   */
  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      // Simple quote to check if API is responsive
      await this.get("/quote", {
        inputMint: "So11111111111111111111111111111111111111112",
        outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        amount: "1000000",
      });
      return { healthy: true, latencyMs: Date.now() - start };
    } catch {
      return { healthy: false, latencyMs: Date.now() - start };
    }
  }
}


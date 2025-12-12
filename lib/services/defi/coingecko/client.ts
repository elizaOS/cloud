/**
 * CoinGecko HTTP Client
 *
 * Specialized HTTP client for CoinGecko API with Pro/Free tier handling.
 */

import { BaseHttpClient } from "../base-client";

const COINGECKO_FREE_URL = "https://api.coingecko.com/api/v3";
const COINGECKO_PRO_URL = "https://pro-api.coingecko.com/api/v3";

/**
 * CoinGecko-specific HTTP client
 */
export class CoinGeckoClient extends BaseHttpClient {
  private readonly isPro: boolean;

  constructor(config: { apiKey?: string; timeout?: number }) {
    const isPro = Boolean(config.apiKey);

    super(
      {
        baseUrl: isPro ? COINGECKO_PRO_URL : COINGECKO_FREE_URL,
        apiKey: config.apiKey ?? "",
        headers: config.apiKey
          ? { "x-cg-pro-api-key": config.apiKey }
          : {},
        timeout: config.timeout,
        maxRetries: 3,
        retryDelay: 1000,
      },
      "CoinGecko"
    );

    this.isPro = isPro;
  }

  /**
   * Check if using Pro API
   */
  isProTier(): boolean {
    return this.isPro;
  }

  /**
   * Health check for CoinGecko - ping endpoint
   */
  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      await this.get("/ping");
      return { healthy: true, latencyMs: Date.now() - start };
    } catch {
      return { healthy: false, latencyMs: Date.now() - start };
    }
  }
}


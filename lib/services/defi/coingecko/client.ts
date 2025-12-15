/**
 * CoinGecko HTTP Client
 *
 * Specialized HTTP client for CoinGecko API with Pro/Free tier handling.
 */

import { BaseHttpClient } from "../base-client";

const COINGECKO_FREE_URL = "https://api.coingecko.com/api/v3";
const COINGECKO_PRO_URL = "https://pro-api.coingecko.com/api/v3";

export class CoinGeckoClient extends BaseHttpClient {
  private readonly tier: "free" | "demo" | "pro";

  constructor(config: { apiKey?: string; timeout?: number }) {
    // Determine tier based on API key format
    // Demo keys start with "CG-", Pro keys don't have this prefix
    const tier = !config.apiKey
      ? "free"
      : config.apiKey.startsWith("CG-")
        ? "demo"
        : "pro";
    const baseUrl = tier === "pro" ? COINGECKO_PRO_URL : COINGECKO_FREE_URL;
    const headerKey =
      tier === "pro"
        ? "x-cg-pro-api-key"
        : tier === "demo"
          ? "x-cg-demo-api-key"
          : "";

    super(
      {
        baseUrl,
        apiKey: config.apiKey ?? "",
        headers: headerKey ? { [headerKey]: config.apiKey! } : {},
        timeout: config.timeout,
        maxRetries: 3,
        retryDelay: 1000,
      },
      "CoinGecko",
    );

    this.tier = tier;
  }

  isProTier(): boolean {
    return this.tier === "pro";
  }

  getTier(): "free" | "demo" | "pro" {
    return this.tier;
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

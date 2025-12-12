/**
 * Helius HTTP Client
 *
 * Specialized HTTP client for Helius Solana RPC and Data API.
 */

import { BaseHttpClient } from "../base-client";

const HELIUS_API_URL = "https://api.helius.xyz/v0";
const HELIUS_RPC_URL = "https://mainnet.helius-rpc.com";

/**
 * Helius-specific HTTP client
 */
export class HeliusClient extends BaseHttpClient {
  private readonly rpcUrl: string;

  constructor(config: { apiKey: string; timeout?: number; devnet?: boolean }) {
    const baseUrl = `${HELIUS_API_URL}`;

    super(
      {
        baseUrl,
        apiKey: config.apiKey,
        timeout: config.timeout,
      },
      "Helius"
    );

    this.rpcUrl = config.devnet
      ? `https://devnet.helius-rpc.com/?api-key=${config.apiKey}`
      : `${HELIUS_RPC_URL}/?api-key=${config.apiKey}`;
  }

  /**
   * Override buildUrl to add API key as query param
   */
  protected buildUrl(
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>
  ): string {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    url.searchParams.set("api-key", this.apiKey);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    return url.toString();
  }

  /**
   * Make RPC request
   */
  async rpcRequest<T>(method: string, params: unknown[] = []): Promise<T> {
    const response = await fetch(this.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method,
        params,
      }),
    });

    if (!response.ok) {
      throw new Error(`Helius RPC error: ${response.status}`);
    }

    const json = await response.json() as { result?: T; error?: { message: string } };

    if (json.error) {
      throw new Error(`Helius RPC error: ${json.error.message}`);
    }

    return json.result as T;
  }

  /**
   * Get RPC URL for direct connection
   */
  getRpcUrl(): string {
    return this.rpcUrl;
  }

  /**
   * Health check for Helius
   */
  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      await this.rpcRequest("getHealth");
      return { healthy: true, latencyMs: Date.now() - start };
    } catch {
      return { healthy: false, latencyMs: Date.now() - start };
    }
  }
}


/**
 * DeFi Services Module
 *
 * Centralized exports for all DeFi API integrations including:
 * - Birdeye (Solana analytics)
 * - Jupiter (Solana DEX aggregator)
 * - Helius (Solana RPC & webhooks)
 * - CoinGecko (market data)
 * - CoinMarketCap (market data)
 * - 0x/ZeroEx (EVM DEX aggregator)
 * - Defined.fi (cross-chain analytics)
 *
 * Usage:
 * ```ts
 * import { getBirdeyeService, getJupiterService } from "@/lib/services/defi";
 *
 * const birdeye = getBirdeyeService();
 * const price = await birdeye.getTokenPrice("So11111111111111111111111111111111111111112");
 * ```
 */

// Shared types and operations
export * from "./types";
export * from "./operations";

// Base client
export { BaseHttpClient, type HttpClientConfig, type RequestOptions } from "./base-client";

// Individual service exports
export {
  BirdeyeService,
  getBirdeyeService,
  resetBirdeyeService,
  type BirdeyeConfig,
} from "./birdeye";

export {
  JupiterService,
  getJupiterService,
  resetJupiterService,
  type JupiterConfig,
} from "./jupiter";

export {
  CoinGeckoService,
  getCoinGeckoService,
  resetCoinGeckoService,
  type CoinGeckoConfig,
} from "./coingecko";

export {
  HeliusService,
  getHeliusService,
  resetHeliusService,
  type HeliusConfig,
} from "./helius";

export {
  CoinMarketCapService,
  getCoinMarketCapService,
  resetCoinMarketCapService,
  type CoinMarketCapConfig,
} from "./coinmarketcap";

export {
  ZeroExService,
  getZeroExService,
  resetZeroExService,
  type ZeroExConfig,
} from "./zeroex";

export {
  DefinedService,
  getDefinedService,
  resetDefinedService,
  type DefinedConfig,
} from "./defined";

/**
 * Get all available DeFi services
 */
export function getAllDeFiServices() {
  return {
    birdeye: getBirdeyeService(),
    jupiter: getJupiterService(),
    coingecko: getCoinGeckoService(),
    helius: getHeliusService(),
    coinmarketcap: getCoinMarketCapService(),
    zeroex: getZeroExService(),
    defined: getDefinedService(),
  };
}

/**
 * Check health of all DeFi services
 */
export async function checkAllServicesHealth() {
  const services = getAllDeFiServices();
  const results: Record<string, { healthy: boolean; latencyMs: number }> = {};

  const checks = await Promise.allSettled([
    services.birdeye.healthCheck().then((r) => ({ name: "birdeye", ...r })),
    services.jupiter.healthCheck().then((r) => ({ name: "jupiter", ...r })),
    services.coingecko.healthCheck().then((r) => ({ name: "coingecko", ...r })),
    services.helius.healthCheck().then((r) => ({ name: "helius", ...r })),
    services.coinmarketcap.healthCheck().then((r) => ({ name: "coinmarketcap", ...r })),
    services.zeroex.healthCheck().then((r) => ({ name: "zeroex", ...r })),
    services.defined.healthCheck().then((r) => ({ name: "defined", ...r })),
  ]);

  for (const result of checks) {
    if (result.status === "fulfilled") {
      results[result.value.name] = {
        healthy: result.value.healthy,
        latencyMs: result.value.latencyMs,
      };
    } else {
      results["unknown"] = { healthy: false, latencyMs: -1 };
    }
  }

  return results;
}


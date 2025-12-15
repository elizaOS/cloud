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
export {
  BaseHttpClient,
  type HttpClientConfig,
  type RequestOptions,
} from "./base-client";

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

// Use checkServicesHealth from operations.ts for health checks

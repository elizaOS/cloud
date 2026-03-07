/**
 * Service Proxy Configuration
 *
 * Central configuration for service proxy behavior.
 * Environment variables override defaults.
 */

export const PROXY_CONFIG = {
  /**
   * Pricing cache TTL (seconds)
   *
   * CRITICAL: This TTL is a safety net for cache consistency.
   * If cache invalidation fails after DB update, stale pricing will
   * persist until this TTL expires.
   *
   * Default: 300s (5 minutes)
   * - Short enough to limit revenue exposure from stale pricing
   * - Long enough to reduce DB load from cache misses
   *
   * Trade-offs:
   * - Lower TTL: Faster consistency, higher DB load
   * - Higher TTL: Lower DB load, longer stale data exposure
   */
  PRICING_CACHE_TTL: parseInt(process.env.PRICING_CACHE_TTL || "300"),
  PRICING_CACHE_STALE_TIME: parseInt(process.env.PRICING_CACHE_STALE_TIME || "150"),

  // Request timeouts (milliseconds)
  UPSTREAM_TIMEOUT_MS: parseInt(process.env.UPSTREAM_TIMEOUT_MS || "25000"),

  // Batch request limits
  MAX_BATCH_SIZE: parseInt(process.env.MAX_BATCH_SIZE || "20"),

  // Helius RPC configuration
  HELIUS_MAINNET_URL: process.env.HELIUS_MAINNET_URL || "https://mainnet.helius-rpc.com",
  HELIUS_DEVNET_URL: process.env.HELIUS_DEVNET_URL || "https://devnet.helius-rpc.com",

  // Fallback RPC URLs (used when primary fails)
  HELIUS_MAINNET_FALLBACK_URL: process.env.HELIUS_MAINNET_FALLBACK_URL,
  HELIUS_DEVNET_FALLBACK_URL: process.env.HELIUS_DEVNET_FALLBACK_URL,

  // Retry configuration
  RPC_MAX_RETRIES: parseInt(process.env.RPC_MAX_RETRIES || "5"),
  RPC_INITIAL_RETRY_DELAY_MS: parseInt(process.env.RPC_INITIAL_RETRY_DELAY_MS || "1000"),
  RPC_MAX_RETRY_DELAY_MS: parseInt(process.env.RPC_MAX_RETRY_DELAY_MS || "16000"),

  // Reduced retries for expensive methods (tier 2+: 10-100 provider credits per call).
  // Helius charges per request, not per successful response, so every retry is real spend.
  RPC_EXPENSIVE_MAX_RETRIES: parseInt(process.env.RPC_EXPENSIVE_MAX_RETRIES || "2"),

  // Circuit breaker — stops retrying when upstream is consistently failing.
  // Opens after THRESHOLD consecutive failures, stays open for OPEN_DURATION_MS,
  // then allows one probe request (half-open). Success resets the circuit.
  RPC_CIRCUIT_FAILURE_THRESHOLD: parseInt(process.env.RPC_CIRCUIT_FAILURE_THRESHOLD || "10"),
  RPC_CIRCUIT_OPEN_DURATION_MS: parseInt(process.env.RPC_CIRCUIT_OPEN_DURATION_MS || "30000"),

  // Market Data API configuration
  MARKET_DATA_BASE_URL: process.env.MARKET_DATA_BASE_URL || "https://public-api.birdeye.so",
  MARKET_DATA_TIMEOUT_MS: parseInt(process.env.MARKET_DATA_TIMEOUT_MS || "15000"),
  MARKET_DATA_MAX_RETRIES: parseInt(process.env.MARKET_DATA_MAX_RETRIES || "3"),
  MARKET_DATA_INITIAL_RETRY_DELAY_MS: parseInt(process.env.MARKET_DATA_INITIAL_RETRY_DELAY_MS || "500"),

  // Alchemy EVM RPC configuration
  ALCHEMY_TIMEOUT_MS: parseInt(process.env.ALCHEMY_TIMEOUT_MS || "25000"),
  ALCHEMY_MAX_RETRIES: parseInt(process.env.ALCHEMY_MAX_RETRIES || "3"),
  ALCHEMY_INITIAL_RETRY_DELAY_MS: parseInt(process.env.ALCHEMY_INITIAL_RETRY_DELAY_MS || "500"),
  ALCHEMY_MAX_BATCH_SIZE: parseInt(process.env.ALCHEMY_MAX_BATCH_SIZE || "20"),
} as const;

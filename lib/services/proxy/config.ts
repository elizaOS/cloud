/**
 * Service Proxy Configuration
 * 
 * Central configuration for service proxy behavior.
 * Environment variables override defaults.
 */

export const PROXY_CONFIG = {
  // Pricing cache TTL (seconds)
  PRICING_CACHE_TTL: parseInt(process.env.PRICING_CACHE_TTL || "300"),
  PRICING_CACHE_STALE_TIME: parseInt(process.env.PRICING_CACHE_STALE_TIME || "150"),
  
  // Request timeouts (milliseconds)
  UPSTREAM_TIMEOUT_MS: parseInt(process.env.UPSTREAM_TIMEOUT_MS || "25000"),
  
  // Batch request limits
  MAX_BATCH_SIZE: parseInt(process.env.MAX_BATCH_SIZE || "20"),
  
  // Helius RPC configuration
  HELIUS_MAINNET_URL: process.env.HELIUS_MAINNET_URL || "https://mainnet.helius-rpc.com",
  HELIUS_DEVNET_URL: process.env.HELIUS_DEVNET_URL || "https://devnet.helius-rpc.com",
} as const;

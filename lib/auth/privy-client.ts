/**
 * Privy Client - Legacy Compatibility Layer
 *
 * This module re-exports OAuth3 functionality for backwards compatibility.
 * All Privy-specific code has been replaced with OAuth3.
 *
 * Migration: Use oauth3-client.ts directly for new code.
 * This file is maintained for backwards compatibility only.
 */

export {
  verifyOAuth3Token as verifyAuthTokenCached,
  invalidateOAuth3TokenCache as invalidatePrivyTokenCache,
  invalidateAllOAuth3TokenCaches as invalidateAllPrivyTokenCaches,
  getOAuth3User as getUserFromIdToken,
  getUserById,
  type OAuth3TokenClaims as AuthTokenClaims,
} from "./oauth3-client";

// Re-export getPrivyClient for legacy code
export { getPrivyClient } from "./oauth3-client";

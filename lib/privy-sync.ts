/**
 * Privy Sync - Legacy Compatibility Layer
 *
 * This module re-exports OAuth3 sync functionality for backwards compatibility.
 * All Privy-specific code has been replaced with OAuth3.
 *
 * Migration: Use oauth3-sync.ts directly for new code.
 * This file is maintained for backwards compatibility only.
 */

export {
  syncUserFromOAuth3 as syncUserFromPrivy,
  syncUserFromOAuth3,
  syncUserFromClaims,
  syncUserFromPrivy as syncFromPrivy,
} from "./oauth3-sync";

// Re-export the slug generation utility
export { generateSlugFromWallet } from "./oauth3-sync";

// Re-export SyncOptions type for backwards compatibility
export interface SyncOptions {
  signupContext?: {
    ipAddress?: string;
    fingerprint?: string;
    userAgent?: string;
  };
  skipAbuseCheck?: boolean;
}

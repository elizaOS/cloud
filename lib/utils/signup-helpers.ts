
/**
 * Shared signup helpers used by both SIWE and Privy authentication flows.
 *
 * Both SIWE and Privy auth import from this module to ensure consistent
 * account creation. Do NOT duplicate these functions elsewhere.
 */

import crypto from "crypto";

const DEFAULT_INITIAL_CREDITS = 5.0;

/**
 * Returns the number of initial free credits for new signups.
 * Reads from INITIAL_FREE_CREDITS env var, falling back to 5.0.
 */
export function getInitialCredits(): number {
  const envCredits = process.env.INITIAL_FREE_CREDITS;
  if (envCredits) {
    const parsed = parseFloat(envCredits);
    if (!isNaN(parsed) && parsed >= 0) return parsed;
  }
  return DEFAULT_INITIAL_CREDITS;
}

/**
 * Generates a URL-safe slug from a wallet address.
 *
 * Format: "wallet-" + last 6 hex chars + random 6 hex chars + timestamp, lowercased.
 */
export function generateSlugFromWallet(walletAddress: string): string {
  const suffix = walletAddress.slice(-6).toLowerCase();
  const random = crypto.randomBytes(3).toString("hex");
  const timestamp = Date.now().toString(36).slice(-4);
  return `wallet-${suffix}-${timestamp}${random}`;
}

/**
 * Generates a URL-safe slug from an email address.
 *
 * Format: email prefix + random 6 hex chars + timestamp, lowercased.
 */
export function generateSlugFromEmail(email: string): string {
  const prefix = email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "-");
  const random = crypto.randomBytes(3).toString("hex");
  const timestamp = Date.now().toString(36).slice(-4);
  return `${prefix}-${timestamp}${random}`;
}

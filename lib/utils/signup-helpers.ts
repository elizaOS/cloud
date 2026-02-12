
import crypto from "crypto";

/**
 * Default initial credits for new signups.
 * Can be overridden by INITIAL_FREE_CREDITS environment variable.
 */
const DEFAULT_INITIAL_CREDITS = 10.0;

/**
 * Shared signup helpers used by both SIWE and Privy authentication flows.
 *
 * IMPORTANT: Any changes here affect both auth paths. Update tests for both
 * flows when modifying these functions.
 */

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

/**
 * Generates a URL-safe slug from a wallet address.
 *
 * Format: first 6 hex chars + random 6 hex chars, lowercased.
 * This gives enough entropy to avoid collisions while keeping slugs short
 * and recognizable (the prefix matches the wallet).
 */
export function generateSlugFromWallet(walletAddress: string): string {
  const prefix = walletAddress.replace(/^0x/i, "").substring(0, 6).toLowerCase();
  const random = crypto.randomBytes(3).toString("hex");
  return `${prefix}-${random}`;
}

/**
 * Returns the initial credit amount for new signups.
 *
 * Reads from INITIAL_FREE_CREDITS env var, falling back to DEFAULT_INITIAL_CREDITS.
 */
export function getInitialCredits(): number {
  const envCredits = process.env.INITIAL_FREE_CREDITS;
  if (envCredits !== undefined) {
    const parsed = parseFloat(envCredits);
    if (!isNaN(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return DEFAULT_INITIAL_CREDITS;
}

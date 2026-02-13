
/**
 * Shared signup helpers used by both SIWE and Privy authentication flows.
 *
 * This module re-exports helpers from lib/privy-sync.ts so that all auth
 * paths share a single implementation.  Do NOT duplicate these functions —
 * import from here (or directly from lib/privy-sync) instead.
 */

export {
  generateSlugFromWallet,
  getInitialCredits,
} from "@/lib/privy-sync";

import crypto from "crypto";

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

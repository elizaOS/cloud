/**
 * x402 Payment Middleware
 *
 * Uses official x402-next package for HTTP 402 payment handling.
 * Currently only used for credit top-up endpoint.
 *
 * @see https://github.com/coinbase/x402
 */

import { createFacilitatorConfig } from "@coinbase/x402";
import { logger } from "@/lib/utils/logger";

let facilitatorWarningLogged = false;

/**
 * Create facilitator configuration using CDP credentials
 * Returns undefined to use public facilitator if no credentials
 */
export function getFacilitator() {
  const apiKeyId = process.env.CDP_API_KEY_ID;
  const apiKeySecret = process.env.CDP_API_KEY_SECRET;

  if (apiKeyId && apiKeySecret) {
    return createFacilitatorConfig(apiKeyId, apiKeySecret);
  }

  // Log warning once about using public facilitator
  if (!facilitatorWarningLogged) {
    facilitatorWarningLogged = true;

    if (process.env.NODE_ENV === "production") {
      logger.warn(
        "[x402] ⚠️ PRODUCTION WARNING: Using public facilitator for x402 payments. " +
          "This has rate limits and may fail under load. " +
          "Set CDP_API_KEY_ID and CDP_API_KEY_SECRET for reliable payment processing. " +
          "Get credentials at: https://portal.cdp.coinbase.com",
      );
    } else {
      logger.info(
        "[x402] Using public facilitator (no CDP credentials configured). " +
          "For production, set CDP_API_KEY_ID and CDP_API_KEY_SECRET.",
      );
    }
  }

  return undefined;
}

/**
 * Check if x402 facilitator is properly configured
 */
export function isFacilitatorConfigured(): boolean {
  const apiKeyId = process.env.CDP_API_KEY_ID;
  const apiKeySecret = process.env.CDP_API_KEY_SECRET;
  return Boolean(apiKeyId && apiKeySecret);
}

/**
 * Get x402 configuration status for health checks
 */
export function getX402Status() {
  const {
    X402_ENABLED,
    X402_RECIPIENT_ADDRESS,
    isX402Configured,
    getDefaultNetwork,
  } = require("@/lib/config/x402");

  return {
    enabled: X402_ENABLED,
    configured: isX402Configured(),
    recipientConfigured:
      X402_RECIPIENT_ADDRESS !== "0x0000000000000000000000000000000000000000",
    facilitatorConfigured: isFacilitatorConfigured(),
    network: getDefaultNetwork(),
    usingPublicFacilitator: !isFacilitatorConfigured(),
  };
}

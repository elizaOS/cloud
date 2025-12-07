/**
 * x402 Payment Middleware
 *
 * Uses official x402-next package for HTTP 402 payment handling.
 * Currently only used for credit top-up endpoint.
 *
 * @see https://github.com/coinbase/x402
 */

import { createFacilitatorConfig } from "@coinbase/x402";

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

  return undefined;
}

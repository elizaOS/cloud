/**
 * Single source of truth for CORS headers on API responses and preflight.
 *
 * Wildcard origin (`*`) is used for most `/api/*` routes — access control is via
 * API keys, sessions, and other auth headers (not browser origin).
 *
 * For first-party flows that need cookies cross-origin, use
 * `getCorsHeaders` in `packages/lib/utils/cors.ts` (origin allowlist +
 * `Access-Control-Allow-Credentials: true`).
 */

export const CORS_ALLOW_HEADERS = [
  "Content-Type",
  "Authorization",
  "X-API-Key",
  "X-App-Id",
  "X-Request-ID",
  // Note: Cookie is ineffective with wildcard origin but listed for non-wildcard CORS flows
  "Cookie",
  "X-Miniapp-Token",
  "X-Anonymous-Session",
  "X-Gateway-Secret",
  "X-Wallet-Address",
  "X-Timestamp",
  "X-Wallet-Signature",
  "X-Service-Key",
  "Cache-Control",
  "X-Milady-Client-Id",
  "X-PAYMENT",
  "X-PAYMENT-RESPONSE",
  "X-PAYMENT-STATUS",
].join(", ");

export const CORS_ALLOW_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";

export const CORS_MAX_AGE = "86400";

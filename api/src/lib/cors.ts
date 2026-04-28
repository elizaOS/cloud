/**
 * CORS middleware for the Cloud API on Workers.
 *
 * Mirrors `packages/lib/cors-constants.ts`. Wildcard origin is intentional:
 * access control happens via API keys / sessions, not browser origin.
 * Preflight handled here so individual handlers do not have to define OPTIONS.
 */

import { cors } from "hono/cors";

export const ALLOW_HEADERS = [
  "Content-Type",
  "Authorization",
  "X-API-Key",
  "X-App-Id",
  "X-Request-ID",
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
];

export const ALLOW_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

export const corsMiddleware = cors({
  origin: "*",
  allowMethods: ALLOW_METHODS,
  allowHeaders: ALLOW_HEADERS,
  maxAge: 86400,
});

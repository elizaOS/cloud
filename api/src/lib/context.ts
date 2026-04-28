/**
 * Hono context types for the Cloudflare Workers runtime.
 *
 * Bindings: env vars and platform resources injected by Workers.
 * Variables: per-request values populated by middleware (e.g. resolved user).
 *
 * As new env vars are needed in route handlers, add them to `Bindings` and
 * also add a TODO in MIGRATION_NOTES.md so Agent C can register them in
 * wrangler.toml. Never read `process.env` from a Hono handler — it does not
 * exist on Workers; always go through `c.env`.
 */

import type { Context } from "hono";

export interface Bindings {
  // ---- Database ----
  DATABASE_URL: string;
  DATABASE_URL_UNPOOLED?: string;

  // ---- Steward (sole auth provider) ----
  STEWARD_API_URL?: string;
  /** Server-side base URL mirror for SSR fetches that don't go through the SDK. */
  NEXT_PUBLIC_STEWARD_API_URL?: string;
  /** HS256 secret for verifying Steward session JWTs (jose). Either name works. */
  STEWARD_SESSION_SECRET?: string;
  STEWARD_JWT_SECRET?: string;
  /** Tenant scoping. */
  STEWARD_TENANT_ID?: string;
  NEXT_PUBLIC_STEWARD_TENANT_ID?: string;
  /** Server-only platform / tenant API keys (used by services/server-wallets, etc.). */
  STEWARD_PLATFORM_KEYS?: string;
  STEWARD_TENANT_API_KEY?: string;

  // ---- Upstash / Redis ----
  KV_REST_API_URL?: string;
  KV_REST_API_TOKEN?: string;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;

  // ---- Stripe ----
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;

  // ---- Cron auth (shared secret used by api/cron/*) ----
  CRON_SECRET?: string;

  // ---- App config ----
  NEXT_PUBLIC_APP_URL?: string;
  NODE_ENV?: string;

  // ---- Feature flags ----
  REDIS_RATE_LIMITING?: string;
  RATE_LIMIT_DISABLED?: string;
  RATE_LIMIT_MULTIPLIER?: string;
  PLAYWRIGHT_TEST_AUTH?: string;

  // Allow overflow — handlers can read any env var via c.env, but missing
  // ones will be `undefined` at runtime, so prefer adding them above.
  [key: string]: unknown;
}

/**
 * Currently-resolved user. Kept loose because the shared
 * `UserWithOrganization` type pulls in DB types we don't want to depend on
 * from the auth shim. Use `requireUser(c)` to get a typed result.
 */
export interface AuthedUser {
  id: string;
  email?: string | null;
  organization_id?: string | null;
  organization?: { id: string; name?: string; is_active?: boolean } | null;
  is_active?: boolean;
  role?: string;
  steward_id?: string | null;
  wallet_address?: string | null;
  is_anonymous?: boolean;
}

export interface Variables {
  user: AuthedUser | null;
  authMethod?: "session" | "api_key" | "wallet_signature" | "anonymous";
  requestId: string;
}

export type AppEnv = {
  Bindings: Bindings;
  Variables: Variables;
};

export type AppContext = Context<AppEnv>;

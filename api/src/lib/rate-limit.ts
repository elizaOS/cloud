/**
 * Rate-limit middleware for Hono on Workers.
 *
 * Uses Upstash REST (`KV_REST_API_URL` / `KV_REST_API_TOKEN`) keyed on the
 * authenticated identity (api key, user id, anon session) — same precedence
 * as `packages/lib/middleware/rate-limit.ts`. Falls open (no enforcement) if
 * Upstash is not configured. Returns a 429 with the same JSON shape as the
 * Next handlers.
 *
 * Adds `X-RateLimit-{Limit,Remaining,Reset,Policy}` headers on every passed
 * request, mirroring the Next implementation.
 */

import { Redis } from "@upstash/redis/cloudflare";
import type { Context, MiddlewareHandler } from "hono";

import type { AppEnv, Bindings } from "./context";

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (c: Context) => string;
}

function getRedis(env: Bindings): Redis | null {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function getIpKey(c: Context): string {
  const ip =
    c.req.header("cf-connecting-ip") ||
    c.req.header("x-real-ip") ||
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  return `ip:${ip}`;
}

function getDefaultKey(c: Context): string {
  const apiKey =
    c.req.header("x-api-key") ||
    c.req.header("X-API-Key") ||
    (() => {
      const auth = c.req.header("authorization");
      if (!auth?.startsWith("Bearer ")) return null;
      const token = auth.slice(7);
      return token.startsWith("eliza_") ? token : null;
    })();
  if (apiKey) return `apikey:${apiKey}`;

  const userId = (c.get("user") as { id?: string } | null)?.id;
  if (userId) return `user:${userId}`;

  const anon =
    c.req.header("x-anonymous-session") ||
    c.req.header("X-Anonymous-Session") ||
    c.req.header("cookie")?.match(/eliza-anon-session=([^;]+)/)?.[1] ||
    null;
  if (anon) return `anon:${anon}`;

  return "public";
}

interface CheckResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

async function checkUpstash(
  redis: Redis,
  key: string,
  windowMs: number,
  maxRequests: number,
): Promise<CheckResult> {
  const fullKey = `ratelimit:${key}`;
  const count = await redis.incr(fullKey);
  if (count === 1) {
    await redis.pexpire(fullKey, windowMs);
  }
  const ttl = await redis.pttl(fullKey);
  const resetAt = Date.now() + (ttl > 0 ? ttl : windowMs);
  const allowed = count <= maxRequests;
  return {
    allowed,
    remaining: Math.max(0, maxRequests - count),
    resetAt,
    retryAfter: allowed ? undefined : Math.ceil((resetAt - Date.now()) / 1000),
  };
}

export function rateLimit(config: RateLimitConfig): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const env = c.env;

    // Bypass entirely if explicitly disabled (mirrors Next behavior in dev).
    if (env.RATE_LIMIT_DISABLED === "true" && env.NODE_ENV !== "production") {
      await next();
      return;
    }

    const redis = getRedis(env);
    if (!redis) {
      // No Upstash configured — fall open. The Next implementation has an
      // in-memory fallback, but Workers isolates have no shared memory and
      // recycle frequently, so an in-memory map would be useless. Better to
      // be honest and skip the check.
      await next();
      return;
    }

    const key = (config.keyGenerator ?? getDefaultKey)(c);
    const result = await checkUpstash(redis, key, config.windowMs, config.maxRequests);

    const headers = {
      "X-RateLimit-Limit": String(config.maxRequests),
      "X-RateLimit-Remaining": String(result.remaining),
      "X-RateLimit-Reset": new Date(result.resetAt).toISOString(),
      "X-RateLimit-Policy": "redis",
    };

    if (!result.allowed) {
      return c.json(
        {
          success: false,
          error: "Too many requests",
          code: "rate_limit_exceeded" as const,
          message: `Rate limit exceeded. Maximum ${config.maxRequests} requests per ${Math.ceil(
            config.windowMs / 1000,
          )} seconds.`,
          retryAfter: result.retryAfter,
        },
        429,
        { ...headers, "Retry-After": String(result.retryAfter ?? 60) },
      );
    }

    await next();

    // Layer rate-limit headers onto the outgoing response.
    for (const [k, v] of Object.entries(headers)) {
      c.res.headers.set(k, v);
    }
  };
}

function multiplier(env: Bindings): number {
  if (env.NODE_ENV === "production") return 1;
  const raw = env.RATE_LIMIT_MULTIPLIER;
  if (!raw) return 1;
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) || n < 1 ? 1 : n;
}

/**
 * Preset rate limits matching the Next implementation. Multiplier is
 * resolved at preset construction time using a default Bindings stub —
 * Workers can't read env at module init, so multiplier is effectively 1
 * unless individual handlers wrap with a custom config. This is a
 * deliberate tradeoff vs. closure-per-request overhead.
 */
export const RateLimitPresets = {
  STANDARD: { windowMs: 60_000, maxRequests: 60 },
  STRICT: { windowMs: 60_000, maxRequests: 10 },
  RELAXED: { windowMs: 60_000, maxRequests: 200 },
  CRITICAL: { windowMs: 300_000, maxRequests: 5 },
  BURST: { windowMs: 1_000, maxRequests: 10 },
  AGGRESSIVE: { windowMs: 60_000, maxRequests: 100, keyGenerator: getIpKey },
} as const;

// Re-export so handlers can construct ad-hoc configs.
export { getDefaultKey, getIpKey };
export const _multiplier = multiplier;

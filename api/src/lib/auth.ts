/**
 * Workers-native auth resolution.
 *
 * The Next.js implementation in `packages/lib/auth.ts` uses `next/headers`
 * cookies and React `cache()`. Neither works on Workers, so this shim
 * reimplements the same flow using the Hono context:
 *
 *   1. Read auth from headers (X-API-Key / Bearer / Privy cookie / Steward cookie)
 *   2. If a Privy or Steward JWT is present, verify it (Upstash-cached)
 *   3. Look up the user record via the shared services (DB lookups are fine on Workers)
 *
 * Result is memoized on the Hono context with `c.set("user", ...)` so a
 * single request never reverifies.
 *
 * Routes import `getCurrentUser(c)` / `requireUser(c)` from this module —
 * NOT from `@/lib/auth`, which still pulls Next.
 */

import { type AuthTokenClaims, PrivyClient } from "@privy-io/server-auth";
import { Redis } from "@upstash/redis/cloudflare";

import type { AppContext, AuthedUser, Bindings } from "./context";
import { ApiError, AuthenticationError, ForbiddenError } from "./errors";

const PRIVY_AUTH_TTL_SECS = 300;

let _privy: { id: string; client: PrivyClient } | null = null;
function getPrivy(env: Bindings): PrivyClient {
  const appId = env.NEXT_PUBLIC_PRIVY_APP_ID || env.PRIVY_APP_ID;
  const appSecret = env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error("Missing Privy credentials in env");
  }
  if (_privy && _privy.id === appId) return _privy.client;
  _privy = { id: appId, client: new PrivyClient(appId, appSecret) };
  return _privy.client;
}

function getRedis(env: Bindings): Redis | null {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function tokenCacheKey(token: string): Promise<string> {
  const hex = await sha256Hex(token);
  return `api:auth:privy:${hex.slice(0, 32)}`;
}

interface CachedPrivyClaims {
  userId: string;
  appId: string;
  expiration: number;
  cachedAt: number;
}

async function verifyPrivyTokenCached(
  env: Bindings,
  token: string,
): Promise<AuthTokenClaims | null> {
  const redis = getRedis(env);
  const key = redis ? await tokenCacheKey(token) : null;

  if (redis && key) {
    const cached = await redis.get<CachedPrivyClaims>(key);
    if (cached && cached.expiration > Math.floor(Date.now() / 1000)) {
      return {
        userId: cached.userId,
        appId: cached.appId,
        issuer: "privy.io",
        issuedAt: cached.cachedAt,
        expiration: cached.expiration,
        sessionId: "",
      } as unknown as AuthTokenClaims;
    }
  }

  try {
    const claims = await getPrivy(env).verifyAuthToken(token);
    if (redis && key) {
      await redis.setex(key, PRIVY_AUTH_TTL_SECS, {
        userId: claims.userId,
        appId: claims.appId,
        expiration: typeof (claims as { expiration?: number }).expiration === "number"
          ? (claims as { expiration: number }).expiration
          : Math.floor(Date.now() / 1000) + PRIVY_AUTH_TTL_SECS,
        cachedAt: Math.floor(Date.now() / 1000),
      } satisfies CachedPrivyClaims);
    }
    return claims;
  } catch {
    return null;
  }
}

function readAuthCookies(c: AppContext): { privy?: string; steward?: string } {
  const cookieHeader = c.req.header("cookie") ?? "";
  const cookies: Record<string, string> = {};
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (!k) continue;
    cookies[k] = decodeURIComponent(rest.join("="));
  }
  return { privy: cookies["privy-token"], steward: cookies["steward-token"] };
}

function readBearer(c: AppContext): string | null {
  const auth = c.req.header("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim() || null;
}

/**
 * Resolve the current user from the request, with services-backed DB lookup.
 *
 * The DB lookup uses the shared `usersService` from `@/lib/services/users`.
 * That module is plain Drizzle + Neon HTTP — Workers-compatible — but check
 * before bringing in any new shared service that it does not import
 * `next/headers`, `next/cache`, or `react`.
 */
export async function getCurrentUser(c: AppContext): Promise<AuthedUser | null> {
  const cached = c.get("user");
  if (cached !== undefined) return cached;

  const env = c.env;
  const { privy: privyCookie, steward: stewardCookie } = readAuthCookies(c);
  const bearer = readBearer(c);
  const token = bearer || privyCookie || stewardCookie;

  if (!token) {
    c.set("user", null);
    return null;
  }

  const claims = await verifyPrivyTokenCached(env, token);
  if (!claims) {
    c.set("user", null);
    return null;
  }

  // DB lookup. We import here (not at the top) so that routes which never
  // call getCurrentUser don't drag the users service into their bundle.
  const { usersService } = await import("@/lib/services/users");
  const user = await usersService.getByPrivyId(claims.userId);
  if (!user) {
    c.set("user", null);
    return null;
  }

  const authed: AuthedUser = {
    id: user.id,
    email: user.email ?? null,
    organization_id: user.organization_id ?? null,
    organization: user.organization
      ? {
          id: user.organization.id,
          name: user.organization.name,
          is_active: user.organization.is_active,
        }
      : null,
    is_active: user.is_active,
    role: user.role,
    privy_id: (user as { privy_id?: string | null }).privy_id ?? null,
    wallet_address: user.wallet_address ?? null,
    is_anonymous: (user as { is_anonymous?: boolean }).is_anonymous ?? false,
  };

  c.set("user", authed);
  c.set("authMethod", bearer ? "session" : "session");
  return authed;
}

/** 401 if no user. */
export async function requireUser(c: AppContext): Promise<AuthedUser> {
  const user = await getCurrentUser(c);
  if (!user) throw AuthenticationError();
  if (user.is_active === false) throw ForbiddenError("User account is inactive");
  return user;
}

/** 401 if no user, 403 if no org. Mirrors `requireAuthWithOrg`. */
export async function requireUserWithOrg(c: AppContext): Promise<
  AuthedUser & { organization_id: string; organization: NonNullable<AuthedUser["organization"]> }
> {
  const user = await requireUser(c);
  if (!user.organization_id || !user.organization) {
    throw new ApiError(
      403,
      "access_denied",
      "This feature requires a full account. Please sign up to continue.",
    );
  }
  if (user.organization.is_active === false) {
    throw ForbiddenError("Organization is inactive");
  }
  return user as AuthedUser & {
    organization_id: string;
    organization: NonNullable<AuthedUser["organization"]>;
  };
}

/**
 * Same as Next's `requireAuthOrApiKeyWithOrg` — accepts X-API-Key, Bearer
 * token (eliza_*), or session cookie. DB lookups via shared services.
 */
export async function requireUserOrApiKeyWithOrg(c: AppContext): Promise<
  AuthedUser & { organization_id: string; organization: NonNullable<AuthedUser["organization"]> }
> {
  const apiKeyHeader = c.req.header("X-API-Key") || c.req.header("x-api-key");
  const bearer = readBearer(c);
  const elizaBearer = bearer && bearer.startsWith("eliza_") ? bearer : null;
  const apiKey = apiKeyHeader || elizaBearer;

  if (apiKey) {
    const { apiKeysService } = await import("@/lib/services/api-keys");
    const validated = await apiKeysService.validateApiKey(apiKey);
    if (!validated) throw AuthenticationError("Invalid or expired API key");
    if (!validated.is_active) throw ForbiddenError("API key is inactive");
    if (validated.expires_at && new Date(validated.expires_at) < new Date()) {
      throw AuthenticationError("API key has expired");
    }
    const { usersService } = await import("@/lib/services/users");
    const user = await usersService.getWithOrganization(validated.user_id);
    if (!user) throw AuthenticationError("User associated with API key not found");
    if (!user.is_active) throw ForbiddenError("User account is inactive");
    if (!user.organization?.is_active) throw ForbiddenError("Organization is inactive");
    if (!user.organization_id) {
      throw ForbiddenError("This feature requires a full account. Please sign up to continue.");
    }
    void apiKeysService.incrementUsage(validated.id);
    const authed: AuthedUser = {
      id: user.id,
      email: user.email ?? null,
      organization_id: user.organization_id,
      organization: {
        id: user.organization.id,
        name: user.organization.name,
        is_active: user.organization.is_active,
      },
      is_active: user.is_active,
      role: user.role,
      wallet_address: user.wallet_address ?? null,
    };
    c.set("user", authed);
    c.set("authMethod", "api_key");
    return authed as AuthedUser & {
      organization_id: string;
      organization: NonNullable<AuthedUser["organization"]>;
    };
  }

  return requireUserWithOrg(c);
}

/**
 * Cron handlers authenticate via shared secret (Vercel-cron header or
 * Authorization Bearer). Mirrors the convention in `packages/lib/api/cron-auth.ts`.
 */
export function requireCronSecret(c: AppContext): void {
  const expected = c.env.CRON_SECRET;
  if (!expected) {
    // No secret configured — refuse rather than allowing anonymous cron hits.
    throw ForbiddenError("Cron secret not configured");
  }
  const provided =
    c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ||
    c.req.header("x-cron-secret") ||
    null;
  if (provided !== expected) {
    throw AuthenticationError("Invalid cron secret");
  }
}

/**
 * Workers-native auth resolution — Steward only.
 *
 * Privy has been removed; Steward is the sole user-session provider.
 *
 * Auth precedence:
 *   1. X-API-Key header                 → DB lookup (apiKeysService)
 *   2. Bearer eliza_*                   → DB lookup (apiKeysService)
 *   3. Bearer <jwt>                     → Steward verify (jose, HS256)
 *   4. Cookie `steward-token`           → Steward verify (jose, HS256)
 *
 * Steward JWT verification is local (jose) and Upstash-cached. Cache key is a
 * SHA-256 prefix of the token; TTL is `min(token.exp - now, 300s)`.
 *
 * Routes import `getCurrentUser(c)` / `requireUser(c)` from this module —
 * NOT from `@/lib/auth`, which still pulls Next.
 */

import { Redis } from "@upstash/redis/cloudflare";
import { jwtVerify, type JWTPayload } from "jose";

import type { AppContext, AuthedUser, Bindings } from "./context";
import { ApiError, AuthenticationError, ForbiddenError } from "./errors";

const STEWARD_AUTH_TTL_SECS = 300;

interface StewardClaims {
  userId: string;
  email?: string;
  walletAddress?: string;
  walletChain?: "ethereum" | "solana";
  tenantId?: string;
  expiration: number;
}

interface CachedStewardClaims extends StewardClaims {
  cachedAt: number;
}

let _stewardSecret: { raw: string; key: Uint8Array } | null = null;
function getStewardSecret(env: Bindings): Uint8Array | null {
  const raw = env.STEWARD_SESSION_SECRET || env.STEWARD_JWT_SECRET || "";
  if (!raw) return null;
  if (_stewardSecret && _stewardSecret.raw === raw) return _stewardSecret.key;
  _stewardSecret = { raw, key: new TextEncoder().encode(raw) };
  return _stewardSecret.key;
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
  return `api:auth:steward:${hex.slice(0, 32)}`;
}

function extractStewardClaims(payload: JWTPayload): StewardClaims | null {
  const userId = (payload.sub ?? (payload as { userId?: string }).userId ?? "") as string;
  if (!userId) return null;

  const walletAddress = (payload.walletAddress ??
    payload.address ??
    (payload as { publicKey?: string }).publicKey) as string | undefined;
  const walletChain = (payload.walletChain ?? (payload as { wallet_chain?: string }).wallet_chain) as
    | "ethereum"
    | "solana"
    | undefined;
  const tenantId = (payload.tenantId ?? (payload as { tenant_id?: string }).tenant_id) as
    | string
    | undefined;

  return {
    userId,
    email: payload.email as string | undefined,
    walletAddress,
    walletChain,
    tenantId,
    expiration: payload.exp ?? 0,
  };
}

async function verifyStewardTokenCached(
  env: Bindings,
  token: string,
): Promise<StewardClaims | null> {
  const secret = getStewardSecret(env);
  if (!secret) return null;

  const redis = getRedis(env);
  const key = redis ? await tokenCacheKey(token) : null;
  const now = Math.floor(Date.now() / 1000);

  if (redis && key) {
    const cached = await redis.get<CachedStewardClaims>(key);
    if (cached && cached.expiration > now) {
      return {
        userId: cached.userId,
        email: cached.email,
        walletAddress: cached.walletAddress,
        walletChain: cached.walletChain,
        tenantId: cached.tenantId,
        expiration: cached.expiration,
      };
    }
  }

  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
      issuer: "steward",
    }));
  } catch {
    return null;
  }

  const claims = extractStewardClaims(payload);
  if (!claims) return null;

  // Tenant guard: if STEWARD_TENANT_ID is configured, reject sessions for
  // any other tenant. Prevents tenant-mixing where a token issued for a
  // different cloud deployment is replayed against this one.
  const expectedTenant = env.STEWARD_TENANT_ID;
  if (expectedTenant && claims.tenantId && claims.tenantId !== expectedTenant) {
    return null;
  }

  if (redis && key) {
    const tokenRemaining = claims.expiration - now;
    const ttl = Math.min(STEWARD_AUTH_TTL_SECS, tokenRemaining);
    if (ttl > 0) {
      await redis.setex(key, ttl, {
        ...claims,
        cachedAt: now,
      } satisfies CachedStewardClaims);
    }
  }

  return claims;
}

function readStewardCookie(c: AppContext): string | null {
  const cookieHeader = c.req.header("cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === "steward-token") {
      return decodeURIComponent(rest.join("=")) || null;
    }
  }
  return null;
}

function readBearer(c: AppContext): string | null {
  const auth = c.req.header("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim() || null;
}

function looksLikeJwt(token: string): boolean {
  const parts = token.split(".");
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

interface UserShape {
  id: string;
  email?: string | null;
  organization_id?: string | null;
  organization?: { id: string; name?: string; is_active?: boolean } | null;
  is_active?: boolean;
  role?: string;
  wallet_address?: string | null;
  [key: string]: unknown;
}

function toAuthedUser(user: UserShape): AuthedUser {
  return {
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
    steward_id: (user as { steward_id?: string | null }).steward_id ?? null,
    wallet_address: user.wallet_address ?? null,
    is_anonymous: (user as { is_anonymous?: boolean }).is_anonymous ?? false,
  };
}

/**
 * Resolve the current user from the request. Steward session only.
 *
 * The DB lookup uses `usersService.getByStewardId`. JIT sync is intentionally
 * NOT performed here — the Workers runtime can't import the Steward sync
 * module (it pulls Next-shaped DB code via shared services). On the legacy
 * Next path (`packages/lib/auth.ts`), JIT sync runs on first authenticated
 * request and persists the user; subsequent Workers-side requests will then
 * find the user via `getByStewardId`.
 */
export async function getCurrentUser(c: AppContext): Promise<AuthedUser | null> {
  const cached = c.get("user");
  if (cached !== undefined) return cached;

  const bearer = readBearer(c);
  const cookieToken = readStewardCookie(c);
  const token = bearer && looksLikeJwt(bearer) ? bearer : cookieToken;

  if (!token) {
    c.set("user", null);
    return null;
  }

  const claims = await verifyStewardTokenCached(c.env, token);
  if (!claims) {
    c.set("user", null);
    return null;
  }

  const { usersService } = await import("@/lib/services/users");
  const user = await usersService.getByStewardId(claims.userId);
  if (!user) {
    c.set("user", null);
    return null;
  }

  const authed = toAuthedUser(user as unknown as UserShape);
  c.set("user", authed);
  c.set("authMethod", "session");
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
 * token (eliza_* or Steward JWT), or Steward session cookie. DB lookups via
 * shared services.
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
    const authed = toAuthedUser(user as unknown as UserShape);
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
 * Mirrors Next's `requireAdmin`: requires an authenticated user with a wallet
 * connected, and that wallet must be an admin per `adminService`. Returns the
 * resolved user + admin role.
 */
export async function requireAdmin(c: AppContext): Promise<{
  user: AuthedUser & {
    organization_id: string;
    organization: NonNullable<AuthedUser["organization"]>;
  };
  role: string | null;
}> {
  const user = await requireUserOrApiKeyWithOrg(c);
  if (!user.wallet_address) {
    throw AuthenticationError("Wallet connection required for admin access");
  }
  const { adminService } = await import("@/lib/services/admin");
  const isAdmin = await adminService.isAdmin(user.wallet_address);
  if (!isAdmin) throw ForbiddenError("Admin access required");
  const role = await adminService.getAdminRole(user.wallet_address);
  return { user, role };
}

/**
 * Cron handlers authenticate via shared secret (Vercel-cron header or
 * Authorization Bearer). Mirrors the convention in `packages/lib/api/cron-auth.ts`.
 */
export function requireCronSecret(c: AppContext): void {
  const expected = c.env.CRON_SECRET;
  if (!expected) {
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

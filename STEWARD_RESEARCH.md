# Steward integration — verified facts (research output)

Written by the Steward serverless research agent. **Agent D (Privy → Steward swap) — read this BEFORE rewriting `cloud/api/src/lib/auth.ts`.** All facts below are file-cited against `Steward-Fi/steward@develop`.

## TL;DR — the architecture decision is "hybrid"

Cloud Workers verify Steward access tokens **locally with `jose`**. No network call to Steward on the auth hot path. Only login/refresh/oauth/passkey actually hit the Steward Node host. This collapses the migration from "2–3 weeks to port Steward to Workers" down to "1–2 days to add JWT verification to the cloud auth shim."

(A separate, optional follow-up is to PR a Workers adapter upstream to Steward — covered at the bottom. Not required for this migration.)

## What this means for the auth shim

`cloud/api/src/lib/auth.ts` should NOT do `fetch("https://steward/sessions/verify", ...)` to verify a session. Instead:

```ts
import { jwtVerify } from "jose";

const STEWARD_ISSUER = "steward";
const STEWARD_ALG = "HS256";

async function verifyStewardSession(c) {
  const token = getCookie(c, "steward_session_token");
  if (!token) return null;
  const secret = new TextEncoder().encode(c.env.STEWARD_SESSION_SECRET);
  const { payload } = await jwtVerify(token, secret, {
    issuer: STEWARD_ISSUER,
    algorithms: [STEWARD_ALG],
  });
  return {
    userId: payload.userId,
    address: payload.address,
    tenantId: payload.tenantId,
    email: payload.email,
  };
}
```

Cache failures (invalid JWT) via Upstash if you want — but verify is cheap. Cache lookup of the userId → DB user row IS worth doing in KV.

## Critical env-var hazard

**There is a real name collision in Steward.** The auth route signs JWTs with `STEWARD_SESSION_SECRET`, with a fallback to `STEWARD_MASTER_PASSWORD`:

```
packages/api/src/routes/auth.ts:138
const SESSION_SECRET = process.env.STEWARD_SESSION_SECRET ?? process.env.STEWARD_MASTER_PASSWORD;
```

But other Steward code (proxy, agent context) reads `STEWARD_JWT_SECRET`. **These are different variables.** Cloud must use `STEWARD_SESSION_SECRET` for verification or every JWT will fail signature check.

**Action:** in `cloud/.env.example` and `cloud/api/wrangler.toml` secret list, add `STEWARD_SESSION_SECRET` (NOT `STEWARD_JWT_SECRET`). Ensure the value matches what the Steward instance is actually configured with — check `docker-compose.yml` env passing and confirm `STEWARD_SESSION_SECRET` is set there (the compose file currently uses `STEWARD_JWT_SECRET` for both `STEWARD_JWT_SECRET` and `STEWARD_SESSION_SECRET` — flag this in `AUTH_MIGRATION_NOTES.md` as an operator action).

## JWT claims shape

```ts
type StewardSessionClaims = {
  address: string;        // EVM 0x... or Solana pubkey base58
  tenantId: string;       // resolved tenant
  userId: string;         // canonical Steward user ID
  email?: string;         // present if user authed via email/oauth/passkey
  iat: number;
  iss: "steward";
  exp: number;            // 15 min from iat
};
```

Refresh tokens are 30 days, one-time-use, rotated on every `/auth/refresh` call.

## Cookies (cloud BFF sets these — Steward itself doesn't)

Steward's auth endpoints return `{ token, refreshToken, expiresIn, userId, address, ... }` as JSON. The cloud BFF wraps that into HttpOnly cookies. Naming convention used by the existing `StewardProvider.tsx`:

- `steward_session_token` — HttpOnly, Secure, SameSite=Lax, the access JWT
- `steward_refresh_token` — HttpOnly, Secure, SameSite=Lax, the refresh token

Cookie domain/path/SameSite/Secure flags are cloud's decision (Steward doesn't dictate). Recommend: `Domain=.elizacloud.ai` if the SPA and API live on different subdomains; `SameSite=Lax`; `Secure` always; `Path=/`.

## Multi-tenancy

Steward resolves tenant by precedence: `X-Steward-Tenant` header > body `tenantId` > derived `personal-<userId>`. **Cloud must send `X-Steward-Tenant: <cloud-tenant-id>` on every login/register call**, otherwise users land in their personal namespace (Steward's default) instead of the cloud tenant. The cloud tenant ID comes from `STEWARD_TENANT_ID` env (or whatever name the existing integration uses — confirm in the existing code).

The JWT's `tenantId` claim reflects the resolved tenant. Cloud should reject sessions where `tenantId !== c.env.STEWARD_TENANT_ID` to prevent tenant-mixing.

## Endpoint surface (call from cloud only when JWT verify isn't enough)

All under Steward base URL (default `:3200`, configured via `STEWARD_API_URL`).

### Session/JWT
- `GET /auth/nonce` → `{ nonce }` (call before SIWE)
- `POST /auth/verify` body `{ message, signature }` header `X-Steward-Tenant?` → standard auth response (SIWE)
- `POST /auth/verify/solana` body `{ message, signature, publicKey }` → standard auth response (SIWS)
- `GET /auth/session` Bearer auth → `{ authenticated, address, tenantId, email?, userId? }` (cloud doesn't need this — verify locally)
- `POST /auth/refresh` body `{ refreshToken }` → rotated `{ ok, token, refreshToken, expiresIn }`. **One-time use enforced atomically.** Concurrent refresh attempts: one wins, others 401.
- `POST /auth/revoke` body `{ refreshToken }` → revoke this session
- `DELETE /auth/sessions` Bearer auth → revoke all sessions for user
- `POST /auth/logout` → no-op (JWT is stateless; refresh-revoke is the real signout)

### Email magic link
- `POST /auth/email/send` body `{ email, tenantId? }` → `{ ok, data: { expiresAt } }`
- `POST /auth/email/verify` body `{ token, email, tenantId? }` → standard auth response
- `GET /auth/callback/email?token&email&tenantId?` → 302 to `EMAIL_AUTH_REDIRECT_BASE_URL/login?token=&refreshToken=` (default `https://www.elizacloud.ai/login`)

### Passkey (WebAuthn)
- `POST /auth/passkey/register/options` body `{ email, authenticatorAttachment? }` → WebAuthn creation options
- `POST /auth/passkey/register/verify` body `{ email, response, tenantId? }` → standard auth response
- `POST /auth/passkey/login/options` body `{ email }` → WebAuthn request options
- `POST /auth/passkey/login/verify` body `{ email, response, tenantId? }` → standard auth response

### OAuth (google, discord, github, twitter)
- `GET /auth/oauth/:provider/authorize?redirect_uri&tenant_id` → 302 to provider
- `GET /auth/oauth/:provider/callback?code&state` → exchanges, 302s to `redirect_uri?token=&refreshToken=`
- `POST /auth/oauth/:provider/token` body `{ code, redirectUri, tenantId?, codeVerifier? }` (SPA/popup) → standard auth response

### Provider gating
- `GET /auth/providers` → `{ passkey, email, siwe, siws, google, discord, github, oauth: string[] }` for UI gating

## Standard auth response shape

```ts
{
  ok: true,
  token: string,          // 15-min access JWT
  refreshToken: string,   // 30-day, one-time-use
  expiresIn: 900,
  userId: string,
  address: string,
  walletChain: "ethereum" | "solana",
  tenant: { id: string, name: string, apiKey?: string }
}
```

The cloud BFF takes this response, sets `steward_session_token` + `steward_refresh_token` cookies, returns success to the SPA.

## Privy → Steward feature gap analysis

| Privy feature | Steward equivalent |
|---|---|
| Email login | `/auth/email/send` + `/auth/email/verify` ✅ |
| Embedded wallet | Steward Vault provisions an EVM/Solana wallet automatically (see `packages/vault/`) ✅ |
| External wallet (MetaMask, etc.) | SIWE via `/auth/verify` ✅ |
| Solana wallet | SIWS via `/auth/verify/solana` ✅ |
| Passkey | `/auth/passkey/*` ✅ |
| Google OAuth | `/auth/oauth/google/*` ✅ |
| Discord OAuth | `/auth/oauth/discord/*` ✅ |
| GitHub OAuth | `/auth/oauth/github/*` ✅ |
| Twitter OAuth | `/auth/oauth/twitter/*` ✅ |
| Apple OAuth | **Gap** — not in Steward's OAuth list. Drop or build. |
| SMS / phone | **Gap** — Steward has no SMS provider. |
| Telegram login | **Gap** — Steward has no Telegram OAuth. |
| Account linking (link email to existing wallet) | **Unclear** — needs Steward feature confirmation. Likely supported via the multi-credential model but no documented endpoint. Flag for operator. |
| `did:privy:...` user IDs in cloud's DB | **Hard problem.** Steward's `userId` is not a DID. Operator-owned migration: add `steward_user_id` column to the users table, link by email/wallet match on first Steward login, keep `did:privy:...` as a legacy ID column for joins. DO NOT auto-execute. |

## Frontend integration

The frontend already has `cloud/packages/lib/providers/StewardProvider.tsx` with `StewardAuthProvider` exporting hooks. **Read what it exports BEFORE replacing `usePrivy()` calls.** Likely surface (verify in source):

- `useStewardAuth()` → `{ user, isAuthenticated, login, logout }`
- `useStewardWallet()` → `{ address, walletChain, sign }`
- Login flow: SPA calls cloud BFF `/api/auth/steward/login` with credentials → BFF calls Steward → BFF sets cookies → SPA reads `useStewardAuth()`

The `MaybeStewardProvider` wrapper in the current `RootLayout.tsx` is gated by `NEXT_PUBLIC_STEWARD_AUTH_ENABLED`. **Flip the default to always-on; remove the gate.**

## Steward-on-Workers (optional follow-up, NOT for this run)

If/when you want to deploy Steward itself on Cloudflare Workers (eliminating the Node host entirely), the work is well-scoped:

1. New `packages/api/src/worker.ts` exporting `{ fetch: app.fetch }` next to existing `index.ts` (Bun.serve)
2. Swap `drizzle-orm/postgres-js` → `drizzle-orm/neon-http` (schema is fully compatible — no extensions, no LISTEN/NOTIFY, no advisory locks)
3. Swap `ioredis` → `@upstash/redis` (REST client; preserves sorted-set rate limiter and HINCRBY spend tracker)
4. Replace 4 in-memory `Map`/`setInterval` instances (SIWE nonce store, rate-limit log) with the existing `ChallengeStore` abstraction
5. Drop runtime `runMigrations()` (already gated by `SKIP_MIGRATIONS=1`); run `drizzle-kit migrate` in CI instead
6. Add `wrangler.toml` with `nodejs_compat` for `node:crypto` (used by AES-256-GCM keystore, OAuth PKCE)

These changes are upstreamable as additive PRs. Effort: 2–3 weeks for one engineer. Cloud's hybrid integration works whether Steward runs on Workers, Node, or Hetzner — so this is decoupled from the cloud migration timeline.

## Operator action items (for `AUTH_MIGRATION_NOTES.md`)

1. Confirm `STEWARD_SESSION_SECRET` env value matches the Steward instance's signing secret (NOT `STEWARD_JWT_SECRET`)
2. Confirm `STEWARD_TENANT_ID` for the cloud tenant (or equivalent var name in existing integration)
3. Update OAuth app registrations (Google, Discord, GitHub, Twitter) to use Steward's callback URL `{STEWARD_API_URL}/auth/oauth/{provider}/callback`
4. Plan the `did:privy:...` → `steward_user_id` DB migration. Recommend: dual-write phase, then cutover by linking on email/wallet match at first Steward login.
5. Decide what to do about Apple/SMS/Telegram if any of those auth providers had real users on Privy.

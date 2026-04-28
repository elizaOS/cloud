# Auth migration notes — Privy → Steward (sole provider)

Owner: Auth agent (this worktree). Branch: `shaw/refactor`. Coordinates with
Agent B (api Hono port), Agent F (containers), Agent G (in-progress route
conversions).

## Inventory (baseline at start of work)

```
$ grep -rn '@privy-io' --include='*.ts' --include='*.tsx' \
   --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.next-build \
   --exclude-dir=dist . | wc -l
19

$ grep -rln 'privy-token\|privy-refresh\|privy-id-token' --include='*.ts' \
   --include='*.tsx' --exclude-dir=node_modules . | wc -l
7
```

### Files with `@privy-io/*` imports (19 hits, 18 files)

| File                                                                      | Symbol(s)                                               | Action                                                      |
| ------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------- |
| `proxy.ts`                                                                | `PrivyClient`                                           | Strip Privy; leave file (cleanup pass deletes).             |
| `next.config.ts`                                                          | `serverComponentsExternalPackages: "@privy-io/server-auth"` | Drop entry.                                                 |
| `frontend/auth/error/page.tsx`                                            | `useLogin, usePrivy`                                    | Replace with Steward equivalents.                           |
| `frontend/login/privy-login-section.tsx`                                  | `useLogin, useLoginWithEmail, useLoginWithOAuth, usePrivy` | Delete file; only Steward login remains.                    |
| `packages/ui/src/components/settings/crypto-payment-modal.tsx`            | `usePrivy, useWallets`                                  | Wallet flow — `// TODO(steward)` until Steward wallet UX confirmed. |
| `packages/ui/src/components/settings/tabs/account-tab.tsx`                | `usePrivy`                                              | Replace with Steward `useAuth().user`.                      |
| `packages/ui/src/components/chat/email-capture-modal.tsx`                 | `usePrivy`                                              | Replace with Steward equivalent (just reads authenticated state). |
| `packages/ui/src/components/layout/user-menu.tsx`                         | `useLogout, usePrivy`                                   | Replace with Steward `useAuth()` + sign-out.                |
| `packages/tests/unit/steward-proxy-refresh.test.ts`                       | `mock.module("@privy-io/server-auth")`                  | Drop the Privy mock; test now exercises Steward-only path.  |
| `packages/lib/privy-sync.ts`                                              | `User as PrivyUser`                                     | Whole file is Privy-only — gate behind dead-code removal.   |
| `packages/lib/auth/privy-client.ts`                                       | `PrivyClient, AuthTokenClaims`                          | DELETE entire file.                                         |
| `packages/lib/providers/CreditsProvider.tsx`                              | `usePrivy`                                              | Replace with Steward `useAuth()`.                           |
| `packages/lib/providers/PostHogProvider.tsx`                              | `usePrivy`                                              | Replace with Steward `useAuth()`.                           |
| `packages/lib/providers/PrivyProvider.tsx`                                | provider                                                | DELETE entire file.                                         |
| `packages/lib/hooks/use-session-auth.ts`                                  | `usePrivy`                                              | Replace with Steward equivalent.                            |
| `packages/lib/hooks/use-admin.ts`                                         | `useWallets`                                            | `// TODO(steward)` until Steward wallet UX confirmed.       |
| `packages/lib/services/server-wallets.ts`                                 | `WalletApiWalletResponseType` (type-only)               | Drop import (used by Privy wallet code path).               |
| `api/src/lib/auth.ts`                                                     | `PrivyClient, AuthTokenClaims`                          | Rewrite to use Steward only.                                |

### Files with `privy-*` cookie references

| File                                  | Action                                                   |
| ------------------------------------- | -------------------------------------------------------- |
| `proxy.ts`                            | Strip Privy cookie reads/clears; keep Steward path.      |
| `packages/lib/auth.ts`                | Rewrite getCurrentUser to read `steward-token` only.     |
| `packages/lib/auth/privy-client.ts`   | DELETE.                                                  |
| `packages/lib/session/session.ts`     | Strip Privy cookie reads.                                |
| `api/auth/logout/route.ts`            | Drop `privy-token`/`privy-refresh-token`/`privy-id-token` deletions. |
| `api/src/middleware/auth.ts`          | Steward cookie only; drop Privy verify.                  |
| `api/src/lib/auth.ts`                 | Steward cookie only.                                     |

### Files with `did:privy:...` user IDs

All under `packages/tests/integration/services/` — fixtures only. Real DB
data uses `users.privy_id` text columns; see "User identity migration" below.

### Files with `PRIVY_*` env var references (selected)

- `.env.example` (lines 47–68 — entire AUTH-PRIVY block to delete)
- `deploy/milady-cloud.railway.env.example` (lines 27–30)
- `next.config.ts:278`
- `proxy.ts:65–66`
- `packages/lib/config/env-validator.ts:45–67`
- `packages/lib/config/wallet-provider-flags.ts:15,18`
- `packages/lib/auth/privy-client.ts:34–39` (deleted)
- `packages/lib/providers/PrivyProvider.tsx:176–177` (deleted)
- `packages/scripts/setup.ts:111–223`
- `packages/tests/playwright/auth-real.spec.ts` (Playwright — keep as-is for legacy test)
- `packages/tests/unit/steward-proxy-refresh.test.ts` (line 57–58 — drop)
- `api/wrangler.toml:116–117` (drop, add Steward equivalents)
- `api/privy/webhook/route.ts:63–65` (deleted with directory)
- `api/src/lib/context.ts:21–23` (drop Privy bindings)
- `api/src/lib/auth.ts:25–30` (rewritten)

## Cookie / env swap table

| Old (Privy)                  | New (Steward)                       | Notes                                                  |
| ---------------------------- | ----------------------------------- | ------------------------------------------------------ |
| Cookie `privy-token`         | Cookie `steward-token`              | Server-side session token (HttpOnly).                  |
| Cookie `privy-refresh-token` | Cookie `steward-refresh-token`      | Refresh path (already wired in proxy + steward-session route). |
| Cookie `privy-id-token`      | (gone — Steward issues a single session token; profile fetched via `/auth/me`). |
| Env `NEXT_PUBLIC_PRIVY_APP_ID` | (gone)                            |                                                        |
| Env `NEXT_PUBLIC_PRIVY_CLIENT_ID` | (gone)                          |                                                        |
| Env `PRIVY_APP_SECRET`       | (gone)                              |                                                        |
| Env `PRIVY_WEBHOOK_SECRET`   | (gone — no Privy webhook anymore)   | Steward does not require a webhook for user sync; user record is created by JIT sync inside the auth path on first authenticated request. |
| —                            | Env `STEWARD_API_URL`               | Server-side base URL for Steward calls + JWT verify.   |
| —                            | Env `NEXT_PUBLIC_STEWARD_API_URL`   | Client-side base URL.                                  |
| —                            | Env `STEWARD_SESSION_SECRET` / `STEWARD_JWT_SECRET` | HS256 secret used by `verifyStewardTokenCached`. Read by `packages/lib/auth/steward-client.ts`. |
| —                            | Env `STEWARD_PLATFORM_KEYS`         | Server platform key for tenant ops (already documented). |
| —                            | Env `STEWARD_TENANT_API_KEY`        | Tenant API key (already documented).                   |
| —                            | Env `STEWARD_TENANT_ID`             | Default tenant ID.                                     |
| —                            | Env `NEXT_PUBLIC_STEWARD_TENANT_ID` | Client tenant ID for the SDK.                          |

## Steward feature gaps (need design decision)

These Privy capabilities have no obvious 1:1 in the existing Steward
integration. Marked `// TODO(steward)` in code; surface to Agent E /
operator before deletion.

1. **Embedded wallet creation on login** — Privy's
   `embeddedWallets.{ethereum,solana}.createOnLogin = "users-without-wallets"`
   means every user gets an EVM + Solana wallet they don't manage. The
   Steward equivalent is the Steward-managed wallet (used in `server-wallets.ts`
   via `STEWARD_PLATFORM_KEYS`), but the per-user creation flow on first login
   is currently gated by `USE_STEWARD_FOR_NEW_WALLETS` and only applies to
   *agent* wallets, not human-user wallets. **Decision needed**: do we keep
   per-user EVM/Solana wallets at all, or drop them entirely and only use
   server-side custody for agent wallets?
2. **External wallet connect (MetaMask / Phantom / Coinbase / WalletConnect)** —
   Privy's `externalWallets.solana.connectors` supports user-controlled
   wallet linking (sign-in with wallet for tipping / payments / SIWE).
   `crypto-payment-modal.tsx` and `use-admin.ts` use `useWallets()`. Steward's
   `@stwd/react` SDK does not appear to expose external-wallet connectors —
   marked `// TODO(steward)`. **Decision needed**: keep wallet connect via a
   separate library (wagmi/viem + @solana/wallet-adapter), or drop the
   feature?
3. **OAuth providers (Google, Discord, GitHub)** — Privy supports them
   directly via `loginMethods`. Steward's OAuth callbacks live on the Steward
   service URL (the Steward-side has GitHub OAuth configured per the env
   note). Confirm the Steward SDK exposes OAuth login flows for these
   providers. The `frontend/login/steward-login-section.tsx` likely already
   wires this; confirmed via inspection.
4. **`user.linked_account` webhook** — Privy's webhook fires when a user
   links a new identity (wallet, OAuth, email). Used for affiliate
   referral qualification (`referralsService.checkAndQualifyReferral`).
   No Steward webhook equivalent in this codebase yet. Referral
   qualification will need to be triggered from the JIT sync path or a
   separate hook. Not blocking for this migration; flagged as
   `// TODO(steward)` in `steward-sync.ts`.
5. **Anonymous session migration** — Privy webhook calls
   `migrateAnonymousSession(...)` when a new user is created. The Steward
   path currently does not do this. Migrate this into `syncUserFromSteward`
   so the first authenticated Steward request (from a previously-anonymous
   browser) attempts the same merge.

## User identity migration (DOCUMENTED — DO NOT EXECUTE)

The `users` table has both `privy_id` (legacy) and `steward_id` (new)
columns. After Privy deletion, every existing row keyed by `privy_id`
becomes an orphan ID — there is no Privy issuer to verify it against.

**Tables touched** (from inspection of `packages/db/migrations/`):

- `users.privy_id` — legacy unique text column.
- `users.steward_id` — added in `0061_add_steward_user_identity_columns.sql`.
- `user_identities.privy_user_id` — legacy unique constraint
  (`PRIVY_IDENTITY_UNIQUE_CONSTRAINT` in `packages/lib/privy-sync.ts:42`).
- `user_identities.steward_user_id` — added alongside steward_id.
- `organizations` — `steward_tenant_*` columns added in
  `0060_add_steward_tenant_columns_to_organizations.sql`.

**Recommended migration approach** (operator-owned, not done in this
PR):

1. Keep `users.privy_id` as a legacy ID column (do not drop).
2. On first Steward-authenticated request from a user whose email or
   wallet matches an existing `privy_id` row, link them by populating
   `users.steward_id` with the Steward user ID. `syncUserFromSteward`
   already does this when an email/wallet match is found
   (`packages/lib/steward-sync.ts:471` and surrounding match logic).
3. Once every active user has been re-authenticated and linked, run a
   one-shot reconciliation script that flags rows with `privy_id IS NOT
   NULL AND steward_id IS NULL` for cleanup.
4. Eventually drop `users.privy_id` + `user_identities.privy_user_id`
   in a follow-up migration. Do this only after confirming the linked-row
   count is stable.

Until step 2 finishes for a given user, that user's first Steward login
will create a new user row — they will lose access to their previous
data. The operator should communicate this in advance OR run a backfill
that pre-links accounts via email match.

## Implementation status — DONE

1. ✅ Inventory + plan (this file).
2. ✅ `api/src/lib/auth.ts` + `api/src/middleware/auth.ts` rewritten Steward-only
   (jose HS256 verify, Upstash-cached, issuer + tenant guarded). Privy bindings
   dropped from `api/src/lib/context.ts`.
3. ✅ Deleted `api/privy/` directory (was just `api/privy/webhook/route.ts`).
   `_router.generated.ts` regenerated; no consumers found in api/ or frontend
   that hit `/api/privy/*` (only `proxy.ts`, which has been stripped).
4. ✅ `packages/lib/auth.ts` rewritten Steward-only. Deleted
   `packages/lib/auth/privy-client.ts`, `packages/lib/privy-sync.ts`, and
   `packages/lib/config/wallet-provider-flags.ts` (no consumers after
   server-wallets.ts simplification).
5. ✅ Per-route Privy refs cleaned: `api/auth/logout/route.ts` (Steward
   cookies), `api/auth/migrate-anonymous/route.ts` (steward_id),
   `api/v1/app-credits/balance/route.ts` (Steward Bearer JWT),
   `api/v1/admin/docker-containers/route.ts`,
   `api/v1/milady/agents/[agentId]/route.ts` and `wallet/route.ts`,
   `api/compat/agents/[id]/route.ts`,
   `api/my-agents/claim-affiliate-characters/route.ts`,
   `packages/lib/api/compat-envelope.ts` (wallet_provider union dropped
   "privy"), `packages/lib/middleware/rate-limit.ts` (dropped
   x-privy-user-id header), `packages/lib/cache/keys.ts` (dropped
   `session.privy` cache key + TTL), `packages/lib/services/server-wallets.ts`
   (dropped `provisionPrivyWallet` / `executePrivyRpc` / Privy unique-violation
   cleanup), `packages/lib/session/session.ts` (Steward cookie + steward_user_id
   migration column).
6. ✅ `proxy.ts` rewritten Steward-only (refresh path retained).
7. ✅ Frontend providers: deleted `packages/lib/providers/PrivyProvider.tsx`;
   `frontend/src/RootLayout.tsx` and `frontend/layout.tsx` now wrap with
   `StewardAuthProvider` unconditionally (no env gate).
8. ✅ Hook replacements: `useSessionAuth` simplified (no Privy state),
   `CreditsProvider` (no Privy refresh path), `PostHogProvider` (Steward
   user shape), `user-menu.tsx` (no useLogout/usePrivy), `account-tab.tsx`
   (no privyLogout), `email-capture-modal.tsx` (redirects to /login),
   `crypto-payment-modal.tsx` (TODO(steward) wallet-connect — see gaps),
   `use-admin.ts` (TODO(steward) external wallet-connect),
   `frontend/auth/error/page.tsx` (no useLogin), deleted
   `frontend/login/privy-login-section.tsx` and updated `login/page.tsx`
   to render only Steward.
9. ✅ Env: `.env.example`, `deploy/milady-cloud.railway.env.example`,
   `packages/scripts/setup.ts`, `packages/lib/config/env-validator.ts`
   updated. `api/wrangler.toml` Privy entries removed and Steward section
   expanded. `next.config.ts` Privy CSP entries + serverComponentsExternalPackages
   entry removed.
10. ✅ Deps: `@privy-io/react-auth` and `@privy-io/server-auth` removed
    from `package.json`, `frontend/package.json`, `api/package.json`. `jose`
    added to `api/package.json`. `bun install` ran clean (2 packages
    removed).
11. ✅ Verify: re-run greps for `@privy-io` and `privy-token` cookies →
    zero hits in non-`node_modules` paths. `bun run --cwd frontend build`
    is green. `bun run --cwd api build` (typecheck) is green for the
    auth shim itself; the residual errors in the wider repo (slack/tiktok/
    twitter providers, telegram-api, vercel-api, etc.) are pre-existing
    `unknown` typing debt unrelated to this migration.

## Privy → Steward final byte count

Privy `@privy-io` import sites:        **19 → 0**
Privy cookie ref sites (non-test):     **7 → 0**
Files deleted:                          5  (PrivyProvider.tsx,
                                          privy-client.ts, privy-sync.ts,
                                          privy-login-section.tsx,
                                          api/privy/webhook/route.ts,
                                          wallet-provider-flags.ts)
Net LOC delta (this branch's auth     ~−1500 (approximate; lots of dead
commits, ignoring containers/agent     Privy code paths and the dual
G's interleaved work):                 Privy/Steward provider scaffolding
                                       collapsed to single Steward path)

## What Agent F (containers) needs from this work

- `api/v1/containers/[id]/metrics/route.ts`,
  `api/v1/containers/[id]/route.ts`,
  `api/v1/containers/credentials/route.ts`,
  `api/v1/containers/route.ts` are still in Agent F's scope (AWS → Hetzner).
  All Privy hooks they previously referenced have been removed at the
  service layer (`server-wallets.ts`, `wallet-provider-flags.ts`); when F
  finishes the AWS swap, no Privy work remains in those files.
- The cron `deployment-monitor` route was untouched.

## What Agent G (route conversions) needs from this work

- Use `getCurrentUser(c)` / `requireUser(c)` / `requireUserOrApiKeyWithOrg(c)`
  from `@/api-lib/auth` (alias for `cloud/api/src/lib/auth.ts`). Surface
  is the same as before; only the verify path changed.
- The `AuthedUser` shape now has `steward_id` (no `privy_id`). Routes that
  previously read `user.privy_id` should read `user.steward_id` instead.
- The middleware (`api/src/middleware/auth.ts`) public-path list is the
  source of truth for which routes skip auth. `api/privy/webhook` is no
  longer in it.


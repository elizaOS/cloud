# Privy Migration Triage
Generated: 2026-04-17 02:39 UTC

## Summary
- Total callsites: 15
- Delete: 2
- Migrate (S/M/L): 4 / 1 / 0
- Keep Privy: 0
- Keep Hybrid: 7
- Product decision: 1

## Scope notes
- This report covers runtime frontend callsites that still invoke Privy hooks directly (`usePrivy`, `useWallets`, `useLogout`, `useLogin`, `useLoginWithEmail`, `useLoginWithOAuth`) or act as the compatibility layer that still depends on those hooks.
- Excluded from the count: docs/examples (`packages/content/authentication.mdx`), comments, generated `llms-full.txt`, and backend/server-auth codepaths that do not use the React hooks.

## Callsites

### 1. app/auth/error/page.tsx
- **Imported by:** Next.js route entrypoint at `/auth/error`
- **Privy features:** `useLogin()` for retry, `usePrivy().ready`
- **Steward equivalent:** yes
- **Verdict:** MIGRATE (S)
- **Notes:** This page does not need provider-specific auth logic. Simplest migration is to stop calling Privy directly and send users to `/login` with an optional `returnTo`, or use shared auth readiness from `useSessionAuth()`. Low-risk cleanup.

### 2. app/dashboard/layout.tsx
- **Imported by:** Next.js route layout for `/dashboard/*`
- **Privy features:** `usePrivy().ready`, `usePrivy().authenticated`
- **Steward equivalent:** yes
- **Verdict:** MIGRATE (S)
- **Notes:** This file is duplicating logic that already exists in `packages/lib/hooks/use-session-auth.ts`. It also uses a manual `steward-authed=` cookie check instead of the shared hook. Replace with `useSessionAuth()` and keep the existing auth-grace behavior. This is one of the easiest wins.

### 3. app/login/privy-login-section.tsx
- **Imported by:** `app/login/page.tsx` when `NEXT_PUBLIC_STEWARD_AUTH_ENABLED !== "true"`
- **Privy features:** `usePrivy()` (`ready`, `authenticated`, `getAccessToken`), `useLogin()` for wallet, `useLoginWithEmail()` for email code flow, `useLoginWithOAuth()` for Google/Discord/GitHub
- **Steward equivalent:** partial
- **Verdict:** KEEP_HYBRID
- **Notes:** This is now a legacy fallback, not the primary steward path. `app/login/page.tsx` already switches to `steward-login-section.tsx` when steward auth is enabled. Deleting this depends on whether you still want to support Privy-only deployments. Steward has equivalents for email and OAuth, but not a drop-in match for the exact Privy email-code UX or wallet connect UX used here. Once the product decision is "steward only everywhere", this file becomes removable.

### 4. packages/lib/hooks/use-admin.ts
- **Imported by:** `packages/ui/src/components/layout/sidebar-section.tsx`
- **Privy features:** `useWallets()`
- **Steward equivalent:** partial
- **Verdict:** MIGRATE (S)
- **Notes:** This hook only needs a wallet address to check admin privileges. It already has a steward fallback via `useSessionAuth()` (`user.walletAddress`). The remaining Privy dependency is just sourcing the wallet from `useWallets()`. That can likely be replaced with canonical wallet data from session/user state or `/api/v1/user`. Main gotcha: preserve the devnet anvil shortcut and make sure wallet-less users still fail closed.

### 5. packages/lib/hooks/use-session-auth.ts
- **Imported by:** widespread shared auth entrypoint, including `app/auth/cli-login/page.tsx`, `app/payment/success/page.tsx`, `app/invite/accept/page.tsx`, `packages/ui/src/components/layout/*`, `packages/ui/src/components/landing/*`, `packages/ui/src/components/chat/*`
- **Privy features:** `usePrivy()` (`ready`, `authenticated`, `user`)
- **Steward equivalent:** no, this is the compatibility layer
- **Verdict:** KEEP_HYBRID
- **Notes:** This is the deliberate bridge between Privy and Steward. Do not remove early. Most of the repo has already migrated to this hook, so it should be one of the last Privy-dependent files to change. Once the last Privy session source is gone, this hook can collapse down to pure steward auth.

### 6. packages/lib/providers/CreditsProvider.tsx
- **Imported by:** `app/layout.tsx`
- **Privy features:** `usePrivy()` (`getAccessToken`, `logout`)
- **Steward equivalent:** partial
- **Verdict:** KEEP_HYBRID
- **Notes:** The provider already uses `useSessionAuth()` for the main auth state. The remaining Privy dependency is specifically for the 401 recovery path on stale Privy sessions, where it refreshes cookies via `getAccessToken()` and logs out if refresh fails. Steward sessions are already cookie-backed and do not use this path. Remove only after Privy sessions are no longer possible.

### 7. packages/lib/providers/PostHogProvider.tsx
- **Imported by:** `app/layout.tsx`
- **Privy features:** `usePrivy().user`
- **Steward equivalent:** partial
- **Verdict:** KEEP_HYBRID
- **Notes:** This provider already supports steward auth via `useSessionAuth()`, but it still reads Privy-specific profile fields to derive signup method, provider metadata, wallet address, and created-at timestamps. If you want to remove Privy here, you need a canonical analytics identity shape sourced from server user data instead of Privy's richer client object.

### 8. packages/lib/providers/PrivyProvider.tsx
- **Imported by:** `app/layout.tsx`
- **Privy features:** `PrivyProvider`, `usePrivy()` (`ready`, `authenticated`, `user`, `getAccessToken`), Privy wallet connector config
- **Steward equivalent:** no direct replacement
- **Verdict:** KEEP_HYBRID
- **Notes:** This is infrastructure, not accidental leftover UI code. It still provides:
  - the actual Privy React context for legacy consumers
  - anonymous-session migration after Privy auth
  - wallet connector configuration that Steward does not replace today
  - fallback context when steward is enabled but Privy config is absent
  Remove this only after every remaining Privy consumer is gone.

### 9. packages/ui/src/components/auth/authorize-content.tsx
- **Imported by:** `app/app-auth/authorize/page.tsx`
- **Privy features:** `usePrivy()` (`ready`, `authenticated`, `user`, `getAccessToken`), `useLogin()`
- **Steward equivalent:** partial
- **Verdict:** PRODUCT_DECISION
- **Notes:** The frontend could be rewritten to use steward auth, but the bigger blocker is the backend contract. `/api/v1/app-auth/connect` and `/api/v1/app-auth/session` currently verify a Privy bearer token and look users up by `users.privy_user_id`. This is not a simple hook swap. Decide first whether Eliza Cloud still wants to support this Privy-style OAuth app authorization flow. If yes, you need a steward-native app auth design, token format, and user mapping.

### 10. packages/ui/src/components/auth/cli-login-content.tsx
- **Imported by:** DEAD
- **Privy features:** `usePrivy()` (`authenticated`, `login`, `user`, `ready`)
- **Steward equivalent:** yes
- **Verdict:** DELETE
- **Notes:** This file is superseded by `app/auth/cli-login/page.tsx`, which already uses `useSessionAuth()` and a `/login?returnTo=...` redirect. Safe dead-code removal.

### 11. packages/ui/src/components/chat/email-capture-modal.tsx
- **Imported by:** `packages/ui/src/components/chat/character-intro-page.tsx`
- **Privy features:** `usePrivy().login` with `loginMethods: ["email"]`
- **Steward equivalent:** yes
- **Verdict:** MIGRATE (M)
- **Notes:** This is more than a hook swap because the current UX is awkward: the modal asks for an email locally, then separately opens Privy email auth, then calls `onSubmit(email)`. A steward migration should probably stop double-collecting email and either:
  - redirect to `/login?intent=signup&returnTo=...`, or
  - call steward email auth directly from the modal.
  Main gotcha: preserve anonymous-session continuation and post-login return-to-chat behavior.

### 12. packages/ui/src/components/chat/signup-prompt-banner.tsx
- **Imported by:** `packages/ui/src/components/chat/build-page-client.tsx`
- **Privy features:** `usePrivy().login`
- **Steward equivalent:** yes
- **Verdict:** MIGRATE (S)
- **Notes:** This is a simple CTA banner. It can stop calling Privy directly and just navigate to `/login` with a `returnTo` back to the current builder/chat context. Very low complexity.

### 13. packages/ui/src/components/layout/user-menu.tsx
- **Imported by:** `packages/ui/src/components/layout/header.tsx`, `packages/ui/src/components/layout/landing-header.tsx`
- **Privy features:** `useLogout()`; also has type-only references to `usePrivy` for helper typing
- **Steward equivalent:** partial
- **Verdict:** KEEP_HYBRID
- **Notes:** The menu is already mostly migrated: it uses `useSessionAuth()` plus `useStewardAuth()`, and only calls Privy logout when a Privy session is active. That is the right behavior during the dual-auth period. Remove the Privy logout path only after no live Privy session can exist.

### 14. packages/ui/src/components/settings/crypto-payment-modal.tsx
- **Imported by:** DEAD
- **Privy features:** `useWallets()`, `usePrivy().connectWallet`, Privy wallet client filtering
- **Steward equivalent:** no
- **Verdict:** DELETE
- **Notes:** Nothing imports this modal right now. If the feature ever comes back, Steward does not provide a drop-in replacement for Privy's external wallet connection flow here. Reintroducing it later would require either a separate wallet integration or a conscious decision to keep Privy around for wallet UX.

### 15. packages/ui/src/components/settings/tabs/account-tab.tsx
- **Imported by:** `packages/ui/src/components/settings/settings-page-client.tsx`
- **Privy features:** `usePrivy().logout`
- **Steward equivalent:** partial
- **Verdict:** KEEP_HYBRID
- **Notes:** This file intentionally signs out of both systems: `stewardSignOut()` plus `/api/auth/steward-session` deletion, then `/api/auth/logout`, then `privyLogout()`. That is the correct coexistence behavior right now. Do not simplify this until Privy-backed sessions are impossible.

## Recommended Order of Work
1. **DELETE** `packages/ui/src/components/auth/cli-login-content.tsx`
   - Dead code, already superseded by `app/auth/cli-login/page.tsx`
2. **DELETE** `packages/ui/src/components/settings/crypto-payment-modal.tsx`
   - Dead code, zero importers
3. **MIGRATE (S)** `app/dashboard/layout.tsx`
   - Swap duplicated Privy logic for `useSessionAuth()`
4. **MIGRATE (S)** `app/auth/error/page.tsx`
   - Stop calling Privy directly, route users back through shared login
5. **MIGRATE (S)** `packages/ui/src/components/chat/signup-prompt-banner.tsx`
   - Replace direct Privy login trigger with `/login` flow
6. **MIGRATE (S)** `packages/lib/hooks/use-admin.ts`
   - Stop depending on `useWallets()` just to source a wallet address
7. **MIGRATE (M)** `packages/ui/src/components/chat/email-capture-modal.tsx`
   - Rework email/signup UX around steward or shared `/login` return flow
8. **PRODUCT_DECISION** `packages/ui/src/components/auth/authorize-content.tsx`
   - Decide whether app authorization remains a product surface at all
9. **KEEP_HYBRID for now**
   - `app/login/privy-login-section.tsx`
   - `packages/lib/hooks/use-session-auth.ts`
   - `packages/lib/providers/CreditsProvider.tsx`
   - `packages/lib/providers/PostHogProvider.tsx`
   - `packages/lib/providers/PrivyProvider.tsx`
   - `packages/ui/src/components/layout/user-menu.tsx`
   - `packages/ui/src/components/settings/tabs/account-tab.tsx`
   These should be tackled last, after the product decision is made and after all user-facing direct Privy hooks are gone.

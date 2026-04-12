# Steward Auth Integration Review — Reviewer 2 (Runtime Safety & Edge Cases)

**Reviewer:** Sol (opus-2)
**Date:** 2026-04-12
**Branch:** dev
**Scope:** Runtime safety, edge cases, failure modes

---

## 1. PrivyProvider Mock Risk (Dummy App ID `cm00000000000000000000000`)

### Will Privy SDK make network requests with the fake ID?

**YES — this is the biggest concern in this PR.**

When `NEXT_PUBLIC_STEWARD_AUTH_ENABLED=true` and Privy is not configured, `PrivyProvider.tsx` (line ~207) renders:

```tsx
<PrivyProviderReactAuth appId="cm00000000000000000000000" config={privyConfig}>
  {children}
</PrivyProviderReactAuth>
```

The Privy React SDK **will**:
- Initialize and attempt to contact `auth.privy.io` with this bogus app ID on mount
- Fire at least one network request per page load (SDK init handshake)
- Return 400/401 errors that will appear in browser console
- Potentially attempt to initialize WalletConnect via the Solana connectors (the `getSolanaConnectors()` call happens unconditionally in `privyConfig`)

### Hydration risk?

Low. Since the login page uses `dynamic(() => import("./privy-login-section"), { ssr: false })`, the `usePrivy()` hooks won't run during SSR. The `PrivyProviderReactAuth` wrapper in layout.tsx IS rendered during SSR, but the provider itself just establishes React context on the server side — the SDK initialization logic runs client-side.

### Will `ready: true, authenticated: false` resolve correctly?

**Uncertain.** With a bogus app ID, the Privy SDK may:
- Set `ready: false` indefinitely if the init handshake fails hard (SDK-dependent behavior)
- Set `ready: true, authenticated: false` after a timeout
- The Privy source isn't open, so we can't verify which path it takes

**If `ready` never becomes `true`**, any component using `usePrivy()` that gates on `ready` will show a loading spinner forever. In steward-only mode this would affect the `PrivyLoginSection` if it's ever loaded (it shouldn't be in `stewardOnly` path, but would in `both` mode).

### The `PrivyAuthWrapper` is SKIPPED in mock mode

Note: When Privy is not configured and Steward is enabled, the render path is:
```tsx
<PrivyProviderReactAuth appId="cm00000000000000000000000" config={privyConfig}>
  {children}  // ← NO PrivyAuthWrapper
</PrivyProviderReactAuth>
```

This means the anonymous session migration logic (`/api/auth/migrate-anonymous`) won't fire. This is **correct behavior** (no Privy users to migrate), but worth documenting.

### 🔴 RECOMMENDATION

Replace the dummy Privy provider with a proper no-op context. Options:
1. **Preferred:** Create a `PrivyNoopProvider` that provides the same context shape with `ready: true, authenticated: false` and no-op functions. Zero network requests.
2. **Acceptable:** Keep current approach but document the console noise and add a comment explaining the dummy ID is intentional. Test that Privy's SDK doesn't crash or hang when given an invalid app ID.
3. **Minimum:** Add an `ErrorBoundary` around the `PrivyProviderReactAuth` in mock mode so if Privy SDK throws, it doesn't take down the whole app.

**Severity: MEDIUM.** Won't break steward-only login, but will cause console errors and wasted network requests on every page load. Could potentially hang `ready` state in `both` mode.

---

## 2. Login Page Split Correctness

### Dynamic import paths: ✅ CORRECT
```tsx
const PrivyLoginSection = dynamic(() => import("./privy-login-section"), { ssr: false });
const StewardLoginSection = dynamic(() => import("./steward-login-section"), { ssr: false });
```
Relative imports, `ssr: false` prevents server-side execution. Both correct.

### Loading fallback: ✅ SENSIBLE
`LoginSectionSpinner` is a lightweight inline component. No hydration mismatch risk since `ssr: false` means server renders the fallback, client replaces it.

### Env var checks — compile-time vs runtime: ⚠️ NUANCE

```tsx
const STEWARD_AUTH_ENABLED = process.env.NEXT_PUBLIC_STEWARD_AUTH_ENABLED === "true";
const PRIVY_CONFIGURED = !!process.env.NEXT_PUBLIC_PRIVY_APP_ID;
```

These are evaluated at **module level** in a `"use client"` component. In Next.js:
- `NEXT_PUBLIC_*` vars are inlined at **build time** by webpack's `DefinePlugin`
- These are effectively compile-time constants
- This means: **changing env vars requires a rebuild**, not just a restart

This is correct behavior for `NEXT_PUBLIC_*` vars, but means you can't toggle steward auth at runtime by changing env vars. Document this.

### "Both" mode rendering: ✅ CORRECT

The `both` path renders `StewardLoginSection` first, divider, then `PrivyLoginSection`. The divider uses a standard "or" pattern. Layout looks correct.

### 🟡 MINOR: `steward-login-section.tsx` creates a new `StewardClient` on every render

```tsx
<StewardProvider
  client={new StewardClient({ baseUrl: STEWARD_AUTH_BASE_URL }) as any}
  ...
>
```

The `new StewardClient()` call is inside the render function body. If `StewardLogin` re-renders, this creates a new client instance each time, which could break internal SDK state or cause unnecessary re-renders.

**Fix:** Memoize the client:
```tsx
const client = useMemo(() => new StewardClient({ baseUrl: STEWARD_AUTH_BASE_URL }), []);
```

Note the `as any` cast on the client — this suggests a type mismatch between `@stwd/sdk` and `@stwd/react` versions. Worth investigating; type mismatches can hide runtime API incompatibilities.

### 🟡 MINOR: Duplicate StewardProvider nesting

In the `stewardOnly` or `both` login paths, the page renders its own `<StewardProvider>` inside `StewardLoginSection`, while `layout.tsx` already wraps everything in `<MaybeStewardProvider>` → `<StewardAuthProvider>` → `<StewardProvider>`. This means `StewardProvider` is nested twice.

Whether this causes issues depends on `@stwd/react` internals:
- If `StewardProvider` uses a single React context, the inner one shadows the outer one (intended)
- If it registers global side effects (event listeners, network connections), you get duplicates

The inner provider in `steward-login-section.tsx` has `agentId=""` while the outer in `StewardProvider.tsx` has `agentId="eliza-cloud"`. This is likely intentional (login page doesn't need an agent ID), but should be documented.

---

## 3. Auth.ts Modification Safety

### Steward check only runs with Bearer token present: ✅ CORRECT

The flow in `requireAuthOrApiKey`:
1. Wallet headers → fail closed (no fallback)
2. `X-API-Key` header → validate as API key
3. `Authorization: Bearer` → JWT check (Privy first, then Steward, then API key fallback)
4. No headers → cookie-based session (`getCurrentUser`)

Steward verification (`verifyStewardTokenCached`) is **only called** inside the `looksLikeJwt(bearerValue)` branch of the Bearer handler. It will never touch cookie-based auth.

### No interference with cookie-based Privy auth: ✅ CORRECT

`getCurrentUser()` reads from `privy-token` cookie. It has no Steward code path. The Steward check is isolated to the Bearer token flow. Clean separation.

### Error handling — graceful fallthrough: ✅ CORRECT

```tsx
// 1. Try Privy token verification
const verifiedClaims = await verifyAuthTokenCached(bearerValue);
if (verifiedClaims) { ... return; }

// 2. Try Steward JWT verification
const stewardClaims = await verifyStewardTokenCached(bearerValue);
if (stewardClaims) { ... }
```

If Privy verification throws (unexpected error), it bubbles up and **skips Steward entirely**. However, looking at `verifyAuthTokenCached`, it likely catches errors and returns null (standard pattern). Let me verify...

In `steward-client.ts`, `verifyStewardTokenCached` catches all errors:
- Expected failures (invalid/expired JWT) → returns `null` ✅
- Unexpected errors → logs error, returns `null` ✅
- Missing secret → returns `null` immediately ✅

**The Steward check will never crash the auth chain.** If verification fails for any reason, it returns null and falls through to the API key check.

### TODO for JIT sync: ⚠️ SAFE BUT INCOMPLETE

```tsx
// TODO: JIT sync from Steward (mirrors Privy JIT sync above)
// Once syncUserFromSteward is implemented, uncomment:
```

But `syncUserFromSteward` IS implemented in `steward-sync.ts`. The TODO comment is stale. The code currently throws `AuthenticationError("User not found")` when a valid Steward JWT has no matching local user. This means:

**🔴 First-time Steward users authenticating via API (Bearer token) will get a 401.**

They must first log in via the browser (login page) for JIT sync to create their local account. This is a real limitation. The `steward-login-section.tsx`'s `StewardLogin` component presumably handles user creation via webhook or callback, but API-first auth (CLI, programmatic) will fail until the web login happens.

**Fix:** Uncomment and wire up the JIT sync:
```tsx
const syncedUser = await syncUserFromSteward({
  stewardUserId: stewardClaims.userId,
  email: stewardClaims.email,
  walletAddress: stewardClaims.address,
});
if (syncedUser) {
  return { user: syncedUser, authMethod: "session", session_token: bearerValue };
}
```

**Severity: HIGH for production.** API-first users will be blocked.

---

## 4. StewardProvider in layout.tsx

### MaybeStewardProvider: ✅ PROPERLY CONDITIONAL

```tsx
const stewardAuthEnabled = process.env.NEXT_PUBLIC_STEWARD_AUTH_ENABLED === "true";

function MaybeStewardProvider({ children }: { children: React.ReactNode }) {
  if (!stewardAuthEnabled) return <>{children}</>;
  return <StewardAuthProvider>{children}</StewardAuthProvider>;
}
```

- `stewardAuthEnabled` is a module-level constant (build-time inlined)
- When false, renders a fragment (zero overhead)
- When true, wraps in `StewardAuthProvider`

### SSR behavior: ✅ SAFE

`StewardAuthProvider` has `"use client"` directive. During SSR:
- The `useMemo` for `StewardClient` will execute (just creates an object, no side effects)
- The `useEffect` for config error logging won't run (SSR skips effects)
- `AuthTokenSync`'s `useEffect` won't run (SSR skips effects)
- Children are passed through — no conditional rendering that could cause hydration mismatch

### Layout shift: ✅ NO RISK

`StewardAuthProvider` renders no visual DOM of its own. It's a pure context provider. If the `isPlaceholderValue` check triggers the passthrough path (`return <>{children}</>`) vs the full provider path, both render identical DOM structure (just children). No layout shift possible.

### Provider order in layout.tsx: ✅ CORRECT

```
PrivyProvider > MaybeStewardProvider > PostHogProvider > CreditsProvider > ThemeProvider
```

Both auth providers are at the top. Steward is inside Privy, which is fine — they manage independent auth state. No dependency conflicts.

---

## 5. Missing Pieces

### `STEWARD_SESSION_SECRET` / `STEWARD_JWT_SECRET`

**What happens if not set?**

In `steward-client.ts`:
```tsx
function getJwtSecret(): Uint8Array | null {
  const raw = process.env.STEWARD_SESSION_SECRET || process.env.STEWARD_JWT_SECRET || "";
  if (!raw) {
    logger.warn("[StewardClient] No STEWARD_SESSION_SECRET or STEWARD_JWT_SECRET configured");
    return null;
  }
  ...
}
```

And in `verifyStewardTokenCached`:
```tsx
const secret = getJwtSecret();
if (!secret) return null;
```

**Result:** If neither env var is set, ALL Steward JWT verifications silently return null. Bearer tokens from Steward users will fall through to the API key check, fail, and return 401. The warning is logged once (lazy init).

**🟡 This is safe but silent.** If you enable Steward auth (`NEXT_PUBLIC_STEWARD_AUTH_ENABLED=true`) but forget to set the JWT secret on the server, the login page will work (client-side SDK handles auth directly with the Steward service), but ALL authenticated API requests will fail with 401.

**Recommendation:** Add a startup check that validates `STEWARD_SESSION_SECRET` is set when `NEXT_PUBLIC_STEWARD_AUTH_ENABLED=true`. Log an ERROR, not just a warning.

### `.env.example` is incomplete

The `.env.example` file has:
```
# STEWARD_API_URL=http://localhost:3200
# STEWARD_TENANT_ID=milady-cloud
```

But is missing the critical auth-related env vars:
- `NEXT_PUBLIC_STEWARD_AUTH_ENABLED` (boolean toggle)
- `NEXT_PUBLIC_STEWARD_API_URL` (client-side API URL)
- `NEXT_PUBLIC_STEWARD_AUTH_BASE_URL` (used by login section)
- `NEXT_PUBLIC_STEWARD_TENANT_ID` (client-side tenant ID)
- `STEWARD_SESSION_SECRET` / `STEWARD_JWT_SECRET` (server-side JWT verification)

**Fix:** Add all Steward env vars to `.env.example` with documentation.

### DB migrations: ✅ ALREADY EXIST

Migration `0061_add_steward_user_identity_columns.sql` adds:
- `steward_user_id` column to both `users` and `user_identities` tables
- Unique indexes on both
- Regular indexes for lookup performance

The `init-steward-db.sh` creates the separate `steward` database for the Steward service itself. These are separate concerns — the cloud app's own DB has the `steward_user_id` columns, the Steward service has its own DB.

### CORS: ✅ NO ADDITIONAL CONFIGURATION NEEDED

`next.config.ts` already sets `Access-Control-Allow-Origin: *` for all API routes. Since Steward auth uses standard `Authorization: Bearer` headers, no additional CORS headers are needed. The `Authorization` header is already in the allowed headers list.

### docker-compose.yml Steward service:

```yaml
environment:
  STEWARD_SESSION_SECRET: ${STEWARD_JWT_SECRET:-dev-jwt-secret-change-in-prod}
```

**🟡 NOTE:** `STEWARD_SESSION_SECRET` is set to the value of `STEWARD_JWT_SECRET` env var. This means the cloud app's server needs the SAME value for its `STEWARD_SESSION_SECRET` env var to verify JWTs. This coupling is implicit — if someone sets different values for the Steward service and the cloud app, auth will silently fail (JWT signature verification fails → returns null → 401).

**Recommendation:** Add a comment in docker-compose.yml and .env.example making this coupling explicit.

---

## Summary

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | Dummy Privy app ID causes console errors & wasted network requests | MEDIUM | Should fix before prod |
| 2 | `steward-login-section.tsx` creates new StewardClient on every render | LOW | Performance fix |
| 3 | Duplicate StewardProvider nesting (login page + layout) | LOW | Document or consolidate |
| 4 | JIT sync TODO is stale — `syncUserFromSteward` exists but isn't wired up in auth.ts | **HIGH** | Must fix for API-first users |
| 5 | Missing startup validation for `STEWARD_SESSION_SECRET` when steward auth enabled | MEDIUM | Should add |
| 6 | `.env.example` missing all `NEXT_PUBLIC_STEWARD_*` vars | LOW | Documentation |
| 7 | `STEWARD_SESSION_SECRET` coupling between services is implicit | LOW | Document |
| 8 | `as any` cast on StewardClient in login section | LOW | Type mismatch investigation |

### Verdict

**Ship with caveats.** The auth chain is sound — Steward JWT verification is properly isolated, error handling is graceful, the fallthrough logic is correct, and cookie-based Privy auth is untouched. The two blockers for production:

1. **Wire up JIT sync for Steward in `auth.ts`** (item 4) — without this, API-first auth for new Steward users is broken
2. **Add startup validation for JWT secret** (item 5) — without this, a misconfigured deployment silently rejects all Steward API requests

Everything else is polish or documentation.

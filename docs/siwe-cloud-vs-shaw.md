# SIWE (Sign-In With Ethereum): cloud vs cloud-shaw

Comparison of **SIWE** (EIP-4361) in **`/root/cloud`** vs **this repo (`cloud-shaw`)**. SIWE enables programmatic wallet auth: get nonce → sign message → verify → get API key, without a browser.

**Status:** SIWE and wallet-header signup are now ported to cloud-shaw. This doc remains for comparison and design notes.

---

## 1. Summary

| Aspect | **cloud** | **cloud-shaw** |
|--------|-----------|----------------|
| **SIWE flow** | Full EIP-4361: nonce → sign → verify → API key | **Same**: `GET /api/auth/siwe/nonce`, `POST /api/auth/siwe/verify`; issues new API key each verify |
| **Wallet auth** | SIWE verify creates/finds user and returns API key | **Both**: SIWE as above; **and** header-based `X-Wallet-Address` + `X-Timestamp` + `X-Wallet-Signature` (per-request; creates account on first use) |
| **Wallet signup** | Via SIWE verify only | **Three paths**: SIWE verify, wallet-header first request, or x402 topup (body or wallet sig); all use `findOrCreateUserByWalletAddress` |
| **Nonce / replay** | One-time nonce in Redis (5 min TTL), consumed on verify | Same; per-request wallet auth uses timestamp (5 min) + method + path |

So **cloud-shaw** now has full SIWE plus wallet-header auth and topup with optional wallet sig; see [docs/wallet-api.md](wallet-api.md).

---

## 2. What cloud has (original SIWE)

### Routes

- **`GET /api/auth/siwe/nonce`**  
  Returns one-time nonce + `domain`, `uri`, `chainId`, `version`, `statement` for building the SIWE message.  
  - Optional query: `chainId` (default 1).  
  - Nonce stored in Redis with 5 min TTL; requires Redis (503 if unavailable).  
  - Rate limit: STRICT.

- **`POST /api/auth/siwe/verify`**  
  Body: `{ message, signature }`. Verifies EIP-4361 message (domain, nonce, signature), consumes nonce, then:  
  - If wallet exists: sign-in, return existing API key (and user/org).  
  - If new wallet: create user + org, grant initial credits, create API key, return key + user/org.  
  - Response: `apiKey`, `address`, `isNewAccount`, `user`, `organization` (see cloud docs).  
  - Rate limit: STRICT.

### Dependencies (cloud)

- **`viem/siwe`**: `generateSiweNonce()`, `parseSiweMessage()` (and verify with `recoverMessageAddress`).
- **Redis**: `CacheKeys.siwe.nonce(nonce)`, `CacheTTL.siwe.nonce` (300s). Nonce consumed atomically (e.g. getAndDeleteNonce) on verify.
- **`lib/utils/app-url.ts`**: `getAppUrl()` for domain/URI (NEXT_PUBLIC_APP_URL / VERCEL_URL / localhost).
- **`lib/utils/siwe-helpers`**: `validateSIWEMessage(message, signature)`, `checkNonce(nonce)` (cloud references this; file may live under a different path or branch).
- **`lib/utils/signup-helpers.ts`**: `getInitialCredits()`, `generateSlugFromWallet()` for new-account creation.
- **User/org creation**: Cloud verify route uses `getUserCreateParams(SiweMessage)`, `getOrganizationDetails`, `transaction.user.create`, `buildSuccessResponse` (and possibly `organizationsService`). So cloud’s user/org layer may be Prisma/transaction-based; shaw uses Drizzle + repositories.
- **Proxy**: `/api/auth/siwe` added to public/unauthenticated paths in `proxy.ts`.

### Docs (cloud)

- **`docs/siwe-authentication.md`**: WHY SIWE, lifecycle, nonce/domain/signature, rate limit, abuse detection, Privy relationship, API key design, funding flow, file list.
- **`content/authentication.mdx`** and **`public/llms*.txt`**: SIWE steps and examples.

### Security (cloud)

- Nonce: single-use, 5 min TTL, not IP-bound (for serverless/agents).
- Domain: SIWE message `domain` must match `getAppUrl()` host.
- Signature: viem `recoverMessageAddress` on raw message string; address comparison via `getAddress()`.
- Abuse detection before signup (e.g. IP / velocity).
- STRICT rate limit on both endpoints.

---

## 3. What cloud-shaw has (no SIWE)

### Wallet-related auth

- **`lib/auth/wallet-auth.ts`**  
  **`verifyWalletSignature(request)`**:  
  - Reads `X-Wallet-Address`, `X-Timestamp`, `X-Wallet-Signature`.  
  - Message format: `Eliza Cloud Authentication\nTimestamp: ${timestamp}\nMethod: ${method}\nPath: ${path}` (per-request, not EIP-4361).  
  - Timestamp window: 5 minutes.  
  - Uses `viem`’s `verifyMessage({ address, message, signature })`.  
  - Then **lookup only**: `usersService.getByWalletAddressWithOrganization(walletAddress)` — **no signup**; user must already exist.

- **`lib/auth.ts`**  
  **`requireAuthOrApiKey`** tries, in order:  
  1. **Wallet signature** (above).  
  2. X-API-Key.  
  3. Authorization: Bearer (Privy JWT or API key).  
  4. Cookie session.  

  So wallet auth in shaw is **authentication only** for existing users; it does **not** create accounts or issue API keys.

### Wallet-based account creation (no SIWE)

- **`/api/v1/topup/10`, `/50`, `/100`**  
  Body can include `walletAddress`. If `usersService.getByWalletAddress(walletAddress)` is null, shaw **creates** org + user (and then continues with top-up flow). So “signup” by wallet exists only in the **top-up** path, not in a dedicated sign-in flow, and there is no nonce/EIP-4361 or “return API key after sign” step.

### Schema

- **`users.wallet_address`** exists in shaw (unique, indexed). So shaw can associate users with wallets; it just doesn’t have SIWE verify creating them or issuing an API key.

### Cache

- **No** SIWE nonce keys or TTLs in shaw’s `lib/cache/keys.ts` (no `siwe` section).

---

## 4. Differences at a glance

| Feature | **cloud** | **cloud-shaw** |
|---------|-----------|----------------|
| GET nonce | Yes (`/api/auth/siwe/nonce`) | No |
| POST verify (EIP-4361) | Yes; create/find user, return API key | No |
| Redis nonce | Yes, 5 min TTL, single-use | N/A |
| Wallet header auth | N/A (SIWE used for programmatic) | Yes; per-request signature for **existing** users |
| Wallet signup | SIWE verify | Top-up only (create user/org if wallet unknown) |
| API key from wallet | Yes (verify response) | No dedicated flow (user gets API key via dashboard/other flows after account exists) |
| EIP-4361 message | Yes | No (custom message in wallet-auth) |
| Doc / content | siwe-authentication.md, authentication.mdx, llms.txt | No SIWE docs |

---

## 5. Combining them

Yes — they combine cleanly. They solve different problems:

| | **SIWE (port from cloud)** | **Existing wallet auth (shaw)** |
|---|---------------------------|----------------------------------|
| **Purpose** | Sign-in / sign-up and **obtain an API key** (and create account if new) | **Authenticate requests** for users who already have `wallet_address` set |
| **When** | Once per agent/session: get nonce → sign → verify → store API key | Every request (optional): send `X-Wallet-Address` + `X-Timestamp` + `X-Wallet-Signature` |
| **Message** | EIP-4361 (nonce, domain, statement, etc.) | Custom (timestamp + method + path) |

**After you add SIWE:**

- **New wallet user:** SIWE verify → create user/org, grant initial credits, create API key → return API key. They can then call APIs with `X-API-Key` (or keep using wallet headers once the account exists).
- **Existing wallet user:** Can already use header-based auth; they can *also* call SIWE verify to **get** (or recover) an API key if they don’t have one.
- **`requireAuthOrApiKey`** stays as-is: (1) wallet signature → (2) API key → (3) Bearer → (4) session. So existing clients that use wallet headers keep working; SIWE just adds a standard way to get an API key and create accounts.

No need to remove the current wallet-auth path. Port SIWE as the **onboarding** flow (get key, create account); keep header-based auth as an **alternative** way to authenticate once the user exists.

---

## 6. If you port SIWE to cloud-shaw

- Add **`GET /api/auth/siwe/nonce`** and **`POST /api/auth/siwe/verify`** (and ensure they’re on public/unauthenticated paths).
- Implement or port **nonce lifecycle**: generate (e.g. `viem/siwe` `generateSiweNonce`), store in Redis with 5 min TTL, consume atomically in verify.
- Port **verify logic**: parse SIWE message, validate domain (`getAppUrl()`), validate nonce, verify signature (viem `recoverMessageAddress` + `getAddress`), then find or create user/org using **shaw’s** stack (Drizzle, `usersRepository`, `organizationsRepository`, `apiKeysService`, `creditsService`). Reuse shaw’s `getByWalletAddress` / create-user pattern; align with `ELIZA_APP_INITIAL_CREDITS` or existing initial-credits behavior.
- Add **`lib/utils/app-url.ts`** (or equivalent) and **SIWE cache keys/TTL** to `lib/cache/keys.ts` if not present.
- **siwe-helpers**: Either port from cloud (validateSIWEMessage, checkNonce) or reimplement in shaw (same semantics: parse, domain check, nonce consume, signature verify).
- **Abuse detection**: If cloud runs it before signup, consider equivalent in shaw (e.g. before creating user/org in verify).
- **Docs**: Port or adapt `docs/siwe-authentication.md` and update `content/authentication.mdx` / any public API docs to describe SIWE for shaw.
- **Tests**: Cloud has multiple SIWE tests (nonce, verify, domain, nonce TTL, race); add or port tests for nonce and verify in shaw.

**Keep** `lib/auth/wallet-auth.ts` and the wallet-signature branch in `requireAuthOrApiKey` — they remain the way existing users can authenticate without sending an API key. SIWE is additive.

This doc and [cloud-vs-shaw-not-ported.md](./cloud-vs-shaw-not-ported.md) can be updated once SIWE is ported or explicitly deferred.

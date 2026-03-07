# Wallet API (SIWE + Wallet Header Auth)

Programmatic authentication and signup using an Ethereum wallet: **SIWE** (Sign-In With Ethereum, EIP-4361) to obtain an API key, and **wallet header signature** to authenticate requests without storing a key. Both paths can create accounts on first use.

## Why a wallet-based API

- **Agents and headless clients** cannot use browser OAuth or session cookies. SIWE gives them a standard way to sign in and receive an API key over HTTP.
- **Per-request signing** (wallet header auth) lets clients authenticate without storing an API key; the wallet proves ownership on each request. **Why both?** SIWE is for onboarding and key issuance; wallet headers are for ongoing requests when the client prefers not to keep a key.
- **x402 topup** can credit the paying wallet; when wallet signature headers are present, we credit the signer so the payer and the credited account are the same.

## Lifecycle

```
ONBOARDING (pick one):
  GET  /api/auth/siwe/nonce     → { nonce, domain, ... }
  POST /api/auth/siwe/verify    → { apiKey, address, isNewAccount, user, organization }
  -- or --
  First request with X-Wallet-Address + X-Timestamp + X-Wallet-Signature (account created automatically)
  -- or --
  POST /api/v1/topup/10|50|100 (x402 payment; body.walletAddress or wallet sig headers)

AUTHENTICATING REQUESTS (pick one):
  X-API-Key: <key from SIWE verify or dashboard>
  X-Wallet-Address + X-Timestamp + X-Wallet-Signature
  Authorization: Bearer <privy JWT or eliza_* API key>
  Cookie: privy-token
```

## SIWE (EIP-4361)

### Why SIWE

- **Nonce** prevents replay: server issues a one-time value, client signs it, server consumes it on verify. **Why not timestamp only?** A timestamp can be replayed within the window; a consumed nonce cannot.
- **Domain binding** (message `domain` must match server host) prevents phishing: the user is signing for this service only.
- **Standard message format** (EIP-4361) is interoperable with wallets and other services.

### Endpoints

**GET /api/auth/siwe/nonce**

Returns parameters to build the SIWE message. **Why return domain/uri/statement?** So clients and agents don’t hardcode or guess; the server is the source of truth.

- Query: `chainId` (optional, default 1).
- Response: `{ nonce, domain, uri, chainId, version, statement }`.
- Nonce is stored in Redis with 5 min TTL. If Redis is unavailable, responds 503. **Why 503?** Without nonce storage we cannot safely verify; failing closed avoids issuing keys on an invalid flow.
- Rate limit: STRICT (10/min in production). **Why STRICT?** Prevents nonce flooding and brute force.

**POST /api/auth/siwe/verify**

- Body: `{ message, signature }` (full EIP-4361 message string and hex signature).
- Server: validates domain (must match `getAppUrl()` host), verifies signature (viem `verifyMessage`), consumes nonce (single-use), then finds or creates user/org via shared `findOrCreateUserByWalletAddress`, issues a new API key, returns it with user/org.
- Response: `{ apiKey, address, isNewAccount, user, organization }`.
- Rate limit: STRICT. **Why?** Verify creates accounts and issues API keys; strict limit reduces abuse.

### Nonce lifecycle (why)

- **Stored by value** in Redis (`siwe:nonce:{nonce}:v1`), TTL 300s. **Why 5 min?** Balance between usability (client has time to sign) and limiting replay window.
- **Consumed on verify**: we get-and-delete the key so each nonce is single-use. **Why validate before consume?** So invalid or malformed requests don’t burn valid nonces.
- **Not IP-bound.** **Why?** Agents run on serverless, VPNs, rotating IPs; binding to IP would break legitimate use without adding real security.

## Wallet header signature auth

- Headers: `X-Wallet-Address`, `X-Timestamp`, `X-Wallet-Signature`.
- Message signed: `Eliza Cloud Authentication\nTimestamp: ${timestamp}\nMethod: ${method}\nPath: ${path}`. **Why method + path?** Binds the signature to this request so it cannot be replayed on another endpoint.
- Timestamp window: 5 minutes. **Why?** Allows clock skew while limiting replay.
- If the wallet is unknown, we **create** the account (same slug/credits as SIWE) so the first signed request is also signup. **Why signup on first sig?** So wallet-only clients can use the API without a separate SIWE step if they prefer.

## x402 topup and wallet

- **POST /api/v1/topup/10**, **/50**, **/100**: payment is enforced by x402; recipient is resolved by `getTopupRecipient`:
  - If **wallet sig headers** are present and valid → credit the signer’s wallet (no body `walletAddress` required). **Why?** So the payer and the credited account are the same when using wallet auth.
  - Else → require **body.walletAddress** and find-or-create that wallet; credit that org. **Why both?** Frontends may send only body; headless clients can send wallet sig so the credited wallet is cryptographically tied to the request.
- New accounts created via topup do **not** receive initial free credits; they only receive the paid amount. **Why?** Initial credits are for signup flows (SIWE, wallet header); topup is payment-only.

## Shared signup behavior (why one path)

All wallet-based account creation goes through **`findOrCreateUserByWalletAddress`** (in `lib/services/wallet-signup.ts`):

- **Slug**: `wallet-${address.toLowerCase()}`. **Why lowercase?** Consistent indexing and uniqueness; EIP-55 checksum is for display only.
- **Stored address**: lowercase in DB. **Why?** Same as slug; lookups use normalized form.
- **Initial credits**: controlled by `grantInitialCredits` (default true for SIWE and wallet-header; false for topup). **Why env `INITIAL_FREE_CREDITS`?** So deployments can set 0 or another value without code change.
- **Race handling**: on unique constraint (duplicate wallet), we re-fetch the user created by the concurrent request and return that. **Why?** Two concurrent signups for the same wallet should both succeed and see the same account.

## Dependencies / SLA

- **Redis**: SIWE nonce storage and wallet-header nonce consumption both require Redis. If Redis is unavailable, the nonce endpoint returns 503 and wallet-header auth throws "Service temporarily unavailable" (no fallback). **Wallet-header auth is fully unavailable during Redis outages**; this is intentional (fail closed for security). API-key and session auth are unaffected.

## Proxy and CORS

- **Public paths**: `/api/auth/siwe`, `/api/v1/topup` (no session required; SIWE and x402 handle their own auth).
- **Passthrough**: Requests with `X-API-Key`, `X-Wallet-Signature`, or `Authorization: Bearer eliza_*` are passed through without requiring a Privy session. **Why check X-Wallet-Signature?** Otherwise wallet-header auth would get 401 at the proxy before `requireAuthOrApiKey` runs.
- **CORS**: `X-Wallet-Address`, `X-Timestamp`, `X-Wallet-Signature` are in `Access-Control-Allow-Headers` so browser clients can send wallet auth.

## Files

| File | Purpose |
|------|--------|
| `lib/utils/app-url.ts` | `getAppUrl()` / `getAppHost()` for SIWE domain check |
| `lib/utils/siwe-helpers.ts` | Parse/validate SIWE message, consume nonce |
| `lib/services/wallet-signup.ts` | `findOrCreateUserByWalletAddress` (SIWE, wallet-auth, topup) |
| `lib/services/topup.ts` | `getTopupRecipient` (wallet sig or body) |
| `lib/auth/wallet-auth.ts` | `verifyWalletSignature` (per-request wallet auth + signup) |
| `app/api/auth/siwe/nonce/route.ts` | GET nonce |
| `app/api/auth/siwe/verify/route.ts` | POST verify, issue API key |
| `lib/cache/keys.ts` | `CacheKeys.siwe.nonce`, `CacheTTL.siwe.nonce` |
| `proxy.ts` | Public paths, wallet-sig passthrough, CORS headers |

## See also

- [docs/siwe-cloud-vs-shaw.md](siwe-cloud-vs-shaw.md) — comparison with the other cloud repo (SIWE and wallet auth).
- [content/authentication.mdx](../content/authentication.mdx) — user-facing auth docs (API key, session, x402, wallet/SIWE).

# SIWE Authentication

Sign-In With Ethereum (EIP-4361) for programmatic agent access to ElizaCloud.

## Why SIWE

Agents need to sign up, fund accounts, and access services without a browser. Privy handles web users well (OAuth, email, embedded wallets), but its auth flow requires a browser session. SIWE gives any Ethereum wallet holder a way to authenticate purely over HTTP -- request a nonce, sign a message, POST it back, get an API key.

## Agent Lifecycle

```text
1. GET  /api/auth/siwe/nonce          → { nonce, domain, uri, chainId, ... }
2. Sign SIWE message locally with wallet private key
3. POST /api/auth/siwe/verify         → { apiKey, address, isNewAccount, ... }
4. Use apiKey with X-API-Key header on all subsequent requests
5. POST /api/crypto/payments          → Fund account (API key auth)
6. Use any API endpoint (agents, containers, etc.)
```

Step 3 handles both sign-up and sign-in transparently. The response includes `isNewAccount` so callers can branch if needed.

## Endpoints

### `GET /api/auth/siwe/nonce`

Returns a one-time nonce and all parameters needed to construct a valid SIWE message.

**Why return everything?** Agents shouldn't need to guess or hardcode the domain, URI, or statement. The server is the source of truth for what it will accept.

**Query parameters:**
- `chainId` (optional, default `1`) -- Ethereum mainnet. Pass the chain your wallet operates on.

**Response:**
```json
{
  "nonce": "a1b2c3d4e5f6g7h8",
  "domain": "elizaos.ai",
  "uri": "https://elizaos.ai",
  "chainId": 1,
  "version": "1",
  "statement": "Sign in to ElizaCloud"
}
```

### `POST /api/auth/siwe/verify`

Verifies a signed SIWE message. Creates a new account if the wallet is unknown, or signs in if it exists.

**Request body:**
```json
{
  "message": "<full SIWE message string>",
  "signature": "0x..."
}
```

**Response (success):**
```json
{
  "apiKey": "eliza_...",
  "address": "0xAbC...123",
  "isNewAccount": true,
  "user": {
    "id": "uuid",
    "name": "0xAbC...0123",
    "privyLinked": false
  },
  "organization": {
    "id": "uuid",
    "name": "0xAbC...0123's Organization",
    "creditBalance": "5.00"
  }
}
```

**Error slugs:**

| Slug | HTTP | Meaning |
|------|------|---------|
| `INVALID_BODY` | 400 | Missing or malformed `message`/`signature`, or SIWE message missing required fields |
| `INVALID_NONCE` | 400 | Nonce expired (>5 min) or already used |
| `INVALID_DOMAIN` | 400 | SIWE message domain doesn't match server |
| `MESSAGE_EXPIRED` | 400 | Client-set `expirationTime` in the past |
| `INVALID_SIGNATURE` | 400 | ecrecover failed or recovered address doesn't match claimed address |
| `ACCOUNT_INACTIVE` | 403 | User or organization deactivated |
| `SIGNUP_BLOCKED` | 403 | Abuse detection rejected the signup |

Error slugs are constant strings for machine classification. The `message` field is English for humans and LLMs.

## Security Model

### Nonce lifecycle

1. Generated server-side using `viem/siwe`'s `generateSiweNonce()` (EIP-4361 compliant)
2. Stored in Redis with 5-minute TTL
3. Consumed (deleted from Redis) immediately when verify begins, before any further validation
4. Each nonce can only be used once

**Why not IP-bind nonces?** Agents run on serverless functions, VPNs, Tor, rotating proxies. Binding to IP would break legitimate programmatic use without meaningful security gain. The nonce is already single-use, short-lived, and bound to a cryptographic signature.

### Domain binding

The SIWE message's `domain` field must match our `NEXT_PUBLIC_APP_URL` hostname. This prevents phishing attacks where an attacker tricks a user into signing a message for a different service.

### Signature verification

Uses `recoverMessageAddress` from viem, which performs EIP-191 ecrecover on the raw message string. The recovered address is compared against the claimed address using `getAddress()` for EIP-55 checksum normalization.

**Why the raw message string?** `recoverMessageAddress` needs the exact bytes that were signed. Passing the parsed object would produce a different hash.

**Why `getAddress()` for comparison?** Ethereum addresses are case-insensitive (`0xABC` == `0xabc`). Raw string comparison would incorrectly reject valid signatures from wallets that return different casing.

### Rate limiting

Both endpoints use `RateLimitPresets.STRICT` because they are unauthenticated and the nonce endpoint creates server-side state (Redis entries).

### Abuse detection

Runs before any resource creation on the signup path. This prevents credit farming -- an attacker generating many wallets to claim welcome credits. The existing `abuseDetectionService` checks IP patterns, user agent signals, and signup velocity.

## Address Handling

Ethereum address casing is a persistent source of bugs. The rules:

| Context | Format | Why |
|---------|--------|-----|
| Comparison | `getAddress(a) === getAddress(b)` | EIP-55 checksum normalization |
| Database storage/lookup | `.toLowerCase()` | Consistent indexing |
| API responses | `getAddress()` (checksummed) | Human-readable, standard format |

Never compare addresses with `===` on raw strings.

## Race Condition Handling

Two concurrent SIWE requests for the same new wallet:

1. Both pass nonce/signature checks
2. First insert succeeds; second hits Postgres unique constraint (`23505`)
3. Second request deletes its orphaned organization
4. Second request retries lookup with exponential backoff (the first request's transaction may not have committed yet)
5. Returns the user created by the first request

This mirrors the existing pattern in `lib/privy-sync.ts` for Privy user creation races.

## Relationship to Privy Auth

SIWE and Privy are parallel auth paths, not competitors:

- **Privy**: Web users, OAuth, email, embedded wallets. Produces a session token.
- **SIWE**: Programmatic agents, any EOA wallet. Produces an API key.

If a wallet is used with both:
- The SIWE verify endpoint sets `wallet_verified: true` on the user record
- The response includes `privyLinked: true` so the agent knows a web account exists
- When a Privy user signs in via web with a wallet that was first created through SIWE, the sync process links them by setting `privy_user_id`

## API Key Design Note

The `api_keys` table stores plaintext keys in the `key` column alongside a SHA-256 hash in `key_hash`. This means:

1. **SIWE re-authentication returns the original key**, not a new one. This is intentional -- agents that lose their key can recover it by re-authenticating.
2. **Validation uses the hash** (`apiKeysService.validateApiKey` hashes the input and compares). The plaintext column is only read when returning keys to their owner.
3. **If the schema migrates to hash-only storage**, the SIWE verify endpoint's `resolveApiKeyForUser` function would need to issue a new key on every authentication instead of returning the existing one. This is called out in a code comment.

This is a pre-existing design decision in the schema, not introduced by SIWE.

## Funding After Signup

The crypto payment endpoints (`/api/crypto/payments/*`) accept API key authentication via the `X-API-Key` header. This enables the full agent lifecycle:

```text
SIWE auth → get API key → create crypto payment → confirm payment → use services
```

These routes were updated from `requireAuthWithOrg()` (Privy-only) to `requireAuthOrApiKeyWithOrg(req)` (Privy or API key) to support this flow.

```text
SIWE auth → get API key → create crypto payment → confirm payment → use services
```

## Files

| File | Purpose |
|------|---------|
| `app/api/auth/siwe/nonce/route.ts` | Nonce generation endpoint |
| `app/api/auth/siwe/verify/route.ts` | Signature verification, sign-up/sign-in, API key issuance |
| `lib/cache/keys.ts` | `CacheKeys.siwe.nonce` and `CacheTTL.siwe.nonce` |
| `proxy.ts` | `/api/auth/siwe` added to public paths |
| `app/api/crypto/payments/route.ts` | Auth guard updated for API key access |
| `app/api/crypto/payments/[id]/route.ts` | Auth guard updated for API key access |
| `app/api/crypto/payments/[id]/confirm/route.ts` | Auth guard updated for API key access |

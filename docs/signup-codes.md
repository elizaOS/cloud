# Signup Codes

One-time bonus credits for new or existing organizations, driven by config and usable from web (Privy) and Eliza App (e.g. Discord) signup flows.

## Why signup codes?

- **Marketing and ads**: Campaigns need a single link (e.g. `yourapp.com/redeem?code=launch50`) that grants extra credits. Env vars are a poor fit (no per-campaign codes, ops-heavy). A JSON config file lets you add/change codes in repo and deploy.
- **One per org**: Each organization may redeem at most one signup code ever. This keeps abuse low and makes “welcome bonus” semantics clear.
- **Two entry points**: Web users sign up via Privy then redeem via GET; Eliza App users can pass a code at Discord (or other) signup so new accounts get base + bonus in one step.

## Design decisions (WHYs)

| Decision | Why |
|----------|-----|
| **Config file (`config/signup-codes.json`)** | Versioned, reviewable, no env bloat. Easy to add codes per campaign without touching env or DB. |
| **GET for redeem** | Marketing/ads use links, not forms. GET with `?code=...` lets one URL both land and redeem (user must be logged in). |
| **No-cache headers on redeem** | Prevents prefetch/cache from triggering redemption; GET is otherwise cacheable. |
| **Partial unique index (one signup_code_bonus per org)** | Prevents double redemption under concurrency; second insert fails with unique violation and we return “already used”. |
| **Primary DB for “already used” check** | Read replica can be stale; using primary avoids granting a second bonus right after a concurrent redeem. |
| **Redacted code in logs** | Code is a shared secret; logs show e.g. `la***` for audit without leaking full value. |
| **Session-only redeem (no API key)** | Redeem is a user action from the app; API keys are for programmatic use and shouldn’t redeem on behalf of an org. |

## Configuration

- **File**: `config/signup-codes.json`
- **Schema**: `{ "codes": { "<code>": <amount>, ... } }` — keys are code strings, values are bonus amounts in dollars (number).
- **Example**: See `config/signup-codes.json` and `config/README.md`.
- **Reload**: Config is loaded and cached at first use per process. New/changed codes apply after deploy (or next cold start in serverless).

## Flows

### 1. Web (Privy) — redeem after signup

1. User signs up with Privy (Google, Discord, email, etc.) and gets default initial credits.
2. User visits a link like `GET /api/signup-code/redeem?code=launch50` (e.g. from marketing) while logged in.
3. If the code is valid and the org hasn’t used a signup code before, bonus credits are added once. Response is JSON; no-cache headers are set.

### 2. Eliza App (e.g. Discord) — code at signup

1. Client sends optional `signup_code` in the signup body (e.g. `POST /api/eliza-app/auth/discord`).
2. For **new** users, `createUserWithOrganization` adds base credits plus bonus when the code is valid.
3. Same one-per-org rule: the bonus is stored as a `signup_code_bonus` credit transaction.

## API

### GET /api/signup-code/redeem

- **Query**: `code` (required) — signup code.
- **Auth**: Session required (`requireAuthWithOrg`). No API key.
- **Responses**:
  - `200`: `{ success: true, bonus: number, message: string }`
  - `400`: Invalid or missing code.
  - `409`: Org has already used a signup code.
  - `401`: Not authenticated or no org.

All responses include no-cache headers so the GET isn’t cached or prefetched.

## Security and limits

- **Rate limit**: Redeem endpoint uses STANDARD preset (e.g. 60/min in prod).
- **One per org**: Enforced by application check plus DB partial unique index on `credit_transactions(organization_id)` where `metadata->>'type' = 'signup_code_bonus'`.
- **Codes**: Stored in config only; not in env. Redacted in logs.

## Roadmap

- **Optional**: Support signup code at Telegram / phone / email signup (same pattern as Discord).
- **Optional**: Admin or script to list/audit redemptions by code or org.
- **Optional**: Expiry or max-redemptions-per-code in config (would require schema or config extension).

## Related

- **Config**: `config/signup-codes.json`, `config/README.md`
- **Service**: `lib/services/signup-code.ts`
- **API**: `app/api/signup-code/redeem/route.ts`
- **Eliza App**: `lib/services/eliza-app/user-service.ts` (`createUserWithOrganization`, `findOrCreateByDiscordId`), `app/api/eliza-app/auth/discord/route.ts`
- **DB**: `db/repositories/credit-transactions.ts` (`hasSignupCodeBonus`), migration `0034_signup_code_bonus_one_per_org.sql`

# Signup Codes

One-time bonus credits for new or existing organizations, loaded from env. Usable from web (session redeem) and from Eliza App Discord/Telegram signup flows.

## Why signup codes?

- **Marketing and ads**: Campaigns need a single shareable form page (e.g. `yourapp.com/signup-codes`) where users can enter promotional codes for extra credits. **Why:** Lets marketing/partners drive signups without code changes; amounts are controlled per environment via env var.
- **One per org**: Each organization may redeem at most one signup code ever. This keeps abuse low and makes “welcome bonus” semantics clear.
- **Distinct from referral codes**: Referral codes link user-to-user and trigger 50/40/10 revenue splits on **purchases**. Signup codes are flat **campaign bonuses** (no revenue split); an org can use both. See [referrals.md](./referrals.md#signup-codes-vs-referrals-when-signup-codes-exist).

## Why env var?

- **No config file**: Codes live in `SIGNUP_CODES_JSON` so deployment platforms (e.g. Vercel) can set them per environment without committing per-env JSON to the repo.
- **Default `{}`**: If unset, we treat it as no codes. **Why:** App starts and runs; signup-code feature is simply disabled until you set the var.

## Rate limit

Redeem endpoint uses **CRITICAL** preset (e.g. 5 requests per 5 minutes in prod). **Why:** Redeem grants credits; strict rate limit reduces brute-force and abuse without blocking legitimate single redemptions.

## Configuration

- **Env var**: `SIGNUP_CODES_JSON` — JSON string. If unset, defaults to `{}` (no codes).
- **Schema**: `{ "codes": { "<code>": <amount>, ... } }` — keys are code strings (case-insensitive), values are bonus amounts in dollars. Example: `{"codes":{"launch50":50,"friend100":100}}`.
- **Reload**: Loaded and cached at first use per process. New/changed codes apply after deploy (or next cold start in serverless).

## API

### POST /api/signup-code/redeem

- **Body**: `{ code: string }` — signup code.
- **Auth**: Session required (`requireAuthWithOrg`). No API key.
- **Responses**:
  - `200`: `{ success: true, bonus: number, message: string }`
  - `400`: Invalid or missing code.
  - `409`: Org has already used a signup code.
  - `401`: Not authenticated or no org.

All responses include no-cache headers.
All responses include no-cache headers so the POST isn’t cached or prefetched.

## Security and limits

- **Rate limit**: CRITICAL preset on the redeem endpoint. **Why:** Limits credit-grant abuse and brute-force.
- **One per org**: Application check (`hasSignupCodeBonus` on primary DB) plus DB partial unique index on `credit_transactions(organization_id)` WHERE `type = 'credit'` AND `metadata->>'type' = 'signup_code_bonus'`. **Why:** Two layers so a race (two concurrent redeems for same org) still only grants one bonus; the second insert fails on the unique index.
- **Session-only redeem**: POST redeem requires session auth, not API key. **Why:** Redemption is a one-time user action from a browser; API keys would allow scripts to burn codes.
- **No-cache headers**: All redeem responses send no-store/no-cache. **Why:** Prevents CDNs or browsers from caching success and hiding 409 (already used).
- **Codes**: From env only; redacted in logs (e.g. `la***`). **Why:** Avoid logging raw codes in case logs are exposed.

## Related

- **Env**: `SIGNUP_CODES_JSON` (optional; validated in `lib/config/env-validator.ts`)
- **Service**: `lib/services/signup-code.ts`
- **API**: `app/api/signup-code/redeem/route.ts`
- **DB**: `db/repositories/credit-transactions.ts` (`hasSignupCodeBonus`), migration `0035_signup_code_bonus_one_per_org.sql`

# Signup Codes

One-time bonus credits for new or existing organizations, driven by config and usable from web (Privy) and Eliza App (e.g. Discord) signup flows.

## Why signup codes?

- **Marketing and ads**: Campaigns need a single link (e.g. `yourapp.com/redeem?code=launch50`) that grants extra credits. Env vars are a poor fit (no per-campaign codes, ops-heavy). A JSON config file lets you add/change codes in repo and deploy.
- **One per org**: Each organization may redeem at most one signup code ever. This keeps abuse low and makes “welcome bonus” semantics clear.
- **Two entry points**: Web users sign up via Privy then redeem via GET; Eliza App users can pass a code at Discord (or other) signup so new accounts get base + bonus in one step.

## Rate Limit

**Rate limit**: Redeem endpoint uses CRITICAL preset (e.g. 5 requests per 5 minutes in prod).

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

## Reseller / partner guide (how to use it)

**Who this is for**: Partners, resellers, or marketing teams who get a signup code and need to share it with end users.

1. **Get your code**  
   The platform operator adds a code for you in `config/signup-codes.json` (e.g. `partner50` → $50 bonus). They give you the **code string** and the **redeem URL** (see below). You don’t manage config yourself.

2. **Share the redeem link**  
   Give your audience a single link. Format:
   ```text
   https://<your-app-domain>/api/signup-code/redeem?code=<your-code>
   ```
   Example: `https://app.example.com/api/signup-code/redeem?code=partner50`  
   Use this in ads, emails, landing pages, or QR codes. One link is enough; no separate “enter code” step if they open it while logged in.

3. **What the end user must do**  
   - Have an account and be **logged in** (session cookie).  
   - Open the link (same browser/session).  
   - If they’re not logged in, they’ll get 401; they should sign up or log in, then open the link again.  
   - Each **organization** can redeem only **one** signup code ever. If they already used any code, they’ll get 409.

4. **What they get**  
   One-time bonus credits (USD) added to their organization’s balance. Amount is defined by the code in config (e.g. $50). Response is JSON (`success`, `bonus`, `message`); you can point users to the dashboard to see their balance.

5. **Eliza App (Discord, etc.)**  
   If your users sign up via the Eliza App (e.g. Discord), the client can send the same code as `signup_code` in the signup request so **new** users get base credits plus the bonus in one step. Existing users still use the redeem link above.

**Summary for resellers**: You get a code and the redeem URL. Share the URL; users must be logged in and open it once. One redemption per org; no forms or extra steps.

---

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

- **Rate limit**: Redeem endpoint uses CRITICAL preset (e.g. 5 requests per 5 minutes in prod).
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

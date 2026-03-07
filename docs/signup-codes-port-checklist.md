# Signup codes — port checklist (from cloud)

When bringing the **signup codes** feature from `/root/cloud` into this repo, use this checklist. Signup codes are **separate** from referrals: one-time campaign bonus per org (config-driven), not user-to-user. See [referrals.md](./referrals.md#signup-codes-vs-referrals-when-signup-codes-exist).

## Files to add or update (from cloud)

| Path | Action |
|------|--------|
| `SIGNUP_CODES_JSON` env var | Optional; JSON `{ "codes": { "launch50": 50 } }`. If unset, defaults to `{}`. |
| `config/README.md` | Doc: signup codes come from env, not config dir. |
| `docs/signup-codes.md` | Add (full WHYs, API, flows) |
| `lib/services/signup-code.ts` | Add |
| `lib/utils/db-errors.ts` | Add if missing (`isUniqueConstraintError`) |
| `app/api/signup-code/redeem/route.ts` | Add (GET redeem, session auth, rate limit CRITICAL) |
| `db/migrations/0035_signup_code_bonus_one_per_org.sql` | Add (partial unique index) or generate equivalent |
| `db/repositories/credit-transactions.ts` | Add `hasSignupCodeBonus(organizationId)` (use dbWrite; see cloud) |
| `app/api/eliza-app/auth/discord/route.ts` | ✅ Accept optional `signup_code` in body; pass to findOrCreateByDiscordId |
| `app/api/eliza-app/auth/telegram/route.ts` | ✅ Accept optional `signup_code` in body; pass to findOrCreateByTelegramWithPhone |
| `lib/services/eliza-app/user-service.ts` | ✅ In `createUserWithOrganization`, optional `signupCode`; after create call `redeemSignupCode(orgId, signupCode)` (warn on failure) |

## Key behaviors

- **One per org**: Enforce in app and via partial unique index on `credit_transactions(organization_id)` WHERE `type = 'credit'` AND `metadata->>'type' = 'signup_code_bonus'`.
- **Redeem endpoint**: GET, session-only (no API key), no-cache headers, rate limit CRITICAL. Return 409 if org already used any signup code.
- **Config**: Load from `SIGNUP_CODES_JSON` env; default `{}` if unset. Cache in process. Redact code in logs (e.g. `la***`).

## Other updates in the same cloud batch (optional)

- `.coderabbit.yaml` — CodeRabbit config
- `README.md` — Extra copy
- `docs/models.md`, `docs/roadmap.md` — Model/roadmap docs
- `content/changelog.mdx` — Changelog entry for signup codes
- `lib/eliza/config.ts`, `lib/fragments/models.ts`, `lib/models/model-tiers.ts`, `lib/services/app-builder-ai-sdk.ts`, `lib/services/eliza-app/config.ts` — Eliza/model/config tweaks

Port only what you need; signup codes are self-contained once the migration and `credit-transactions.hasSignupCodeBonus` are in place.

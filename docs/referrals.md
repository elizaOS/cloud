# Referral System

Sign-up referral program with two commission tiers, signup/qualified bonuses, and optional social share rewards.

## Why we have it

- **Growth**: Referrers share links; new users get a bonus for using a code, so conversion is higher.
- **Retention**: Qualified bonus when the referred user links a social account encourages deeper onboarding.
- **Partners**: Two commission tiers let us offer 5% to standard affiliates and 50% of our margin to strategic partners without running separate programs or code paths.

## Overview

1. **Referral code** — One per user, either 5% or 50% tier (set when the code is created).
2. **Signup** — New user enters a code at signup → we create a signup record and pay signup + referred bonuses.
3. **Commission** — When that user buys credits (Stripe), we pay the referrer a commission based on the code’s tier.
4. **Qualified bonus** — When the referred user links a social account (e.g. Farcaster, Twitter), we pay the referrer an extra one-time bonus.

Commission is **one or the other**: 5% of purchase **or** 50% of our margin, not both. The tier is stored on the referral code and never changed for existing codes.

## Commission tiers

| Tier   | Meaning              | Effective rate (on purchase) | When to use it                    |
|--------|----------------------|------------------------------|-----------------------------------|
| `pct_5`  | 5% of purchase       | 5%                           | Default; standard affiliates      |
| `pct_50` | 50% of our margin    | ~8.33% (1/12)                | Strategic / premium partners      |

**Why 50% of margin:** We have a 20% markup on cost, so margin = 1/6 of revenue. Giving 50% of that to the partner = 1/12 of revenue (~8.33% of each purchase). We store the effective rate (1/12) so we only need the purchase amount at payment time, not cost.

## Flow

```
User A (referrer) gets code via getOrCreateCode(userId, tier).
User B (new user) signs up, enters A’s code → applyReferralCode(B, orgId, code).
  → Signup record created (B linked to A’s code).
  → B gets REFERRED_BONUS ($0.50); A gets SIGNUP_BONUS ($1).
User B links social → checkAndQualifyReferral(B).
  → A gets QUALIFIED_BONUS ($0.50).
User B buys credits (Stripe) → webhook calls processReferralCommission(B, amount, A’s org).
  → Commission = amount * rate_for_tier(A’s code).
  → Credited to A’s org.
```

## Schema (summary)

- **referral_codes** — `user_id` (unique), `code`, `commission_tier` (`pct_5` | `pct_50`), aggregated earnings.
- **referral_signups** — `referral_code_id`, `referrer_user_id`, `referred_user_id` (unique), bonus/commission flags and amounts.

See `db/schemas/referrals.ts` for full definitions.

## API / integration

- **Get or create code:** `referralsService.getOrCreateCode(userId, tier?)` — tier defaults to `pct_5`; only used when creating. Existing code is returned unchanged.
- **Apply at signup:** `referralsService.applyReferralCode(referredUserId, organizationId, code, appContext?)` — call after user is created; returns success/message and optional bonus amount.
- **Commission (internal):** `referralsService.processReferralCommission(purchaserUserId, purchaseAmount, referrerOrganizationId)` — used by Stripe webhook; returns commission amount paid.
- **Qualified bonus:** `referralsService.checkAndQualifyReferral(referredUserId)` — call when user links a social account.
- **Stats:** `referralsService.getReferralStats(userId)` — returns code, `commissionTier`, earnings, recent referrals for dashboard/UI.

Types: `ReferralCommissionTier` = `"pct_5" | "pct_50"` (exported from `lib/services/referrals.ts`).

## Rewards (constants)

Defined in `lib/services/referrals.ts` (`REWARDS`):

- **SIGNUP_BONUS** — $1 to referrer when someone signs up with their code.
- **REFERRED_BONUS** — $0.50 to new user for using a referral code.
- **QUALIFIED_BONUS** — $0.50 to referrer when referred user links social.
- **COMMISSION_RATE_PCT_5** — 0.05 (5% of purchase).
- **COMMISSION_RATE_PCT_50** — 1/12 (50% of margin).
- **SHARE_*** — Per-platform share rewards (X, Farcaster, Telegram, Discord) if using social share rewards.

## Changelog (referrals)

- **Commission tiers:** Added `referral_commission_tier` enum (`pct_5`, `pct_50`) and `commission_tier` on `referral_codes` (default `pct_5`). Commission is 5% of purchase or 50% of margin, chosen per code at creation. See [content/changelog.mdx](../content/changelog.mdx).

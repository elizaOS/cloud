# Referrals & Affiliates

This doc describes the **referral** (signup-based revenue splits) and **affiliate** (markup-based revenue share) systems, how they interact, and why they are designed this way.

---

## Why we have two systems

- **Referrals**: Drive signups. A new user enters someone’s referral code → we record the link and later **redistribute purchase revenue** (50/40/10) when that user buys. One-time link at signup; revenue share is a **split of the purchase**, not extra cost.  
  **WHY:** Aligns referrers with real revenue and supports app-owner/creator splits without per-code commission tiers.

- **Affiliates**: Drive traffic to signup/top-up. A user is **linked** to an affiliate code → we add a **markup** to their top-ups and MCP usage; the affiliate gets that markup.  
  **WHY:** Affiliates are paid from what the customer pays (markup), not from platform margin, so we never over-allocate revenue.

We keep them separate so **no single transaction** is charged both a referral split and an affiliate payout; that would risk giving away more than 100% of revenue.

---

## Referral system

### Flow

1. **Code**: User A gets a referral code via `referralsService.getOrCreateCode(userA.id)`.
2. **Signup**: User B signs up and enters A’s code → `applyReferralCode(B.id, orgId, code, appContext?)`. We create a signup record and optionally set `app_owner_id` / `creator_id` for the 50/40/10 split. We also award **signup bonuses** ($1 to A, $0.50 to B) — these are **marketing spend** (minted), not taken from a purchase.
3. **Qualified bonus**: When B links a social account, we call `checkAndQualifyReferral(B.id)` → A gets $0.50 (again, marketing spend).
4. **Purchase**: When B buys credits (Stripe or x402), we run **revenue splits** via `calculateRevenueSplits(B.id, amount)`. We **redistribute 100%** of the purchase: 50% ElizaCloud, 40% app owner (if set), 10% creator (or 8% creator + 2% editor in multi-tier). No separate “commission” is paid on top — the split *is* the referral payout.

**WHY 50/40/10:** Single, predictable split for platform, app owner, and creator. App owner and creator come from the signup context (`app_owner_id`, `creator_id`) so miniapp/embed flows get the right attribution.

**WHY no per-code commission tier here:** We use one split model for all referred purchases. Adding per-code tiers (e.g. 5% vs 50% of margin) would require schema and webhook changes; see `docs/affiliate-referral-comparison.md` for how the other repo does it.

### Revenue split constants

Defined in `lib/services/referrals.ts` as `REFERRAL_REVENUE_SPLITS`:

- `ELIZA_CLOUD`: 0.5 (50%)
- `APP_OWNER`: 0.4 (40%)
- `CREATOR`: 0.1 (10%)
- Multi-tier: `CREATOR_TIER`: 0.08, `EDITOR_TIER`: 0.02 (8% + 2% = 10%)

**WHY assert at startup:** If someone changes the numbers and they no longer sum to 1.0, the process fails immediately instead of over- or under-allocating in production.

**WHY runtime check in `calculateRevenueSplits`:** We assert `elizaCloudAmount + sum(splits) === purchaseAmount` so any logic bug (e.g. missing branch) throws instead of silently paying wrong amounts.

### Where referral is used

- **Stripe**: `checkout.session.completed` webhook adds credits to the buyer, then runs `calculateRevenueSplits(userId, credits)` and credits app_owner/creator via redeemable earnings.  
  **WHY not in `payment_intent.succeeded`:** Auto top-up uses PaymentIntent only; we don’t run referral splits on auto top-up (no referrer context there by design). So splits run only for checkout sessions (user-initiated credit purchases).
- **x402 top-up**: Routes apply referral code if present (first-touch), add credits, then run `calculateRevenueSplits(user.id, AMOUNT)` and credit splits. Same 100% redistribution.
- **Login/signup attribution**: The login page stores `?ref=` / `?referral_code=` and applies them post-auth through `/api/v1/referrals/apply`, so referral links survive the auth redirect.

### API (referrals)

- `getOrCreateCode(userId)` — get or create referral code for user.
- `applyReferralCode(referredUserId, organizationId, code, appContext?)` — apply at signup; `appContext` can pass `appId`, `appOwnerId`, `creatorId` for 50/40/10.
- `POST /api/v1/referrals/apply` — authenticated route used by the login flow to apply a pending referral code after signup/auth completes.
- `calculateRevenueSplits(userId, purchaseAmount)` — returns `{ elizaCloudAmount, splits }`; used by Stripe webhook and x402.
- `checkAndQualifyReferral(referredUserId)` — called when Privy reports `user.linked_account`; awards the qualified bonus to the referrer once.
- `getReferralStats(userId)` — code, counts, earnings for dashboard.

---

## Affiliate system

### Flow

1. **Code**: User A creates an affiliate code via `affiliatesService.getOrCreateAffiliateCode(userA.id, markupPercent?)` (default 20%).
2. **Link**: User B signs up or is linked via `linkUserToAffiliateCode(B.id, code)`. The web login flow preserves `?affiliate=` and applies it after auth completes.
3. **Charges**: When B’s org uses **auto top-up** or **MCP**, we look up `affiliatesService.getReferrer(B.id)`. If present, we **add** affiliate % (and platform %) to the amount the customer pays; we don’t carve it from the base. Affiliate is paid their share from that markup.

**WHY markup instead of split:** So the platform doesn’t eat the cost. Customer pays base + affiliate% + platform%; we pay the affiliate from that; we keep the rest. Revenue is never over-allocated.

### Where affiliate is used

- **Auto top-up** (`lib/services/auto-top-up.ts`): Customer is charged `amount + affiliateFee + platformFee`; credits added = `amount`. Webhook for auto top-up does **not** run referral splits.
- **MCP usage** (`lib/services/user-mcps.ts`): User is charged `creditsCharged + affiliateFeeCredits + platformFeeCredits`; creator gets share of `creditsCharged`; affiliate gets the fee. MCP `creator_share + platform_share` is always 100%.

### API (affiliates)

- `getOrCreateAffiliateCode(userId, markupPercent?)` — default 20%.
- `updateMarkup(userId, percent)` — change markup for existing code.
- `linkUserToAffiliateCode(userId, code)` — link user to affiliate (e.g. `/api/v1/affiliates/link`).
- `getReferrer(userId)` — used by auto top-up and MCP to resolve affiliate and markup.

---

## No double-apply

- **Referral** = signup-based; used only for **Stripe checkout** and **x402** revenue splits.
- **Affiliate** = link-based; used only for **auto top-up** and **MCP** markup.

A user can be both referred and affiliate-linked, but **no single transaction** is subject to both. So we never pay “50% split + 20% affiliate” on the same dollar.

---

## Signup and qualified bonuses (marketing spend)

- `applyReferralCode` awards $1 to referrer and $0.50 to referred user (credits). These are **minted**, not deducted from any purchase.
- `checkAndQualifyReferral` awards $0.50 to referrer when referred user links social.

**WHY:** Incentivize signups and deeper onboarding; treat as customer acquisition cost, not revenue share.

---

## Signup codes vs referrals (when signup codes exist)

If the repo has **signup codes** (one-time bonus per org, loaded from `SIGNUP_CODES_JSON` env var; `GET /api/signup-code/redeem?code=...`):

- **Signup code**: Campaign/marketing bonus. One redemption **per organization** ever; amount comes from config. No link between users; no revenue split. **WHY:** Shareable links for ads/partners; one per org keeps abuse low.
- **Referral**: User-to-user. User B enters A’s **referral** code at signup → we record the link and later apply **50/40/10 revenue split** on B’s purchases. Referral bonuses ($1 / $0.50) are separate marketing spend.

They are independent: an org can both use a **referral** code at signup (and get referral bonuses + future splits) and later redeem a **signup code** (one-time campaign bonus). See `docs/signup-codes.md` in the repo that has signup codes for flow and API.

---

## Schema and files

- **Referrals**: `db/schemas/referrals.ts` (referral_codes, referral_signups, social_share_rewards), `db/repositories/referrals.ts`, `lib/services/referrals.ts`.
- **Affiliates**: `db/schemas/affiliates.ts` (affiliate_codes, user_affiliates), `db/repositories/affiliates.ts`, `lib/services/affiliates.ts`.
- **Comparison with other repo**: `docs/affiliate-referral-comparison.md`.
- **Revenue math audit**: Section 7 in `docs/affiliate-referral-comparison.md`.

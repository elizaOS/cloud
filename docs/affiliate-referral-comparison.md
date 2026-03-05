# Affiliate & Referral: cloud vs cloud-shaw

Comparison of affiliate and referral behavior between **`/root/cloud`** (reference) and **this repo (`cloud-shaw`)**.

**WHY this doc exists:** When aligning or porting features between the two repos, we need a single place to see schema differences, where each system is used, and that revenue math never exceeds 100%. See also [referrals.md](./referrals.md) for flow and API with WHYs.

**Note:** Comparison re-checked after pulling latest changes into `/root/cloud`. Cloud still uses commission tiers (`pct_5` / `pct_50`) and `processReferralCommission` in the Stripe webhook; no `app_owner_id`/`creator_id` on signups; no revenue-share `affiliate_codes`/`user_affiliates`. Character/miniapp "affiliate" (plugin-affiliate, affiliate-images, etc.) is unchanged.

---

## 1. High-level difference

| Aspect | **cloud** | **cloud-shaw** |
|--------|------------|-----------------|
| **Referral program** | Single system: referral codes with **commission tiers** (5% or 50% of margin). | Referral codes + **revenue splits** (50/40/10) and optional **multi-tier** (creator + editor). |
| **"Affiliate" (revenue)** | No separate affiliate revenue system. "Affiliate" in cloud = **character/miniapp** (plugin-affiliate, images, app discovery). | **Separate affiliate system**: codes + markup %; used for **top-up markup** and **MCP usage fee**. |
| **Purchase → referrer pay** | Stripe webhook calls `processReferralCommission()` → commission by tier (5% or 50% of margin). | Stripe webhook uses **`calculateRevenueSplits()`** only (50/40/10 + multi-tier). |
| **Commission model** | Per-code **tier**: `pct_5` (5% of purchase) or `pct_50` (50% of margin ≈ 8.33%). | No per-code commission; revenue flow is **splits** (50% ElizaCloud, 40% app owner, 10% creator/editor). |

---

## 2. Schema

### 2.1 Referral codes

| Field | **cloud** | **cloud-shaw** |
|-------|-----------|-----------------|
| `commission_tier` | ✅ `pct_5` \| `pct_50` (enum on `referral_codes`) | ❌ Not present |
| `parent_referral_id` | ❌ | ✅ Used for multi-tier (e.g. editor 2% / creator 8%) |

### 2.2 Referral signups

| Field | **cloud** | **cloud-shaw** |
|-------|-----------|-----------------|
| `app_owner_id` | ❌ | ✅ For 40% app-owner split |
| `creator_id` | ❌ | ✅ For 10% creator (or 8%+2% with editor) |

### 2.3 Affiliate (revenue) tables

| Concept | **cloud** | **cloud-shaw** |
|--------|-----------|-----------------|
| Affiliate **codes** (revenue share) | ❌ No `affiliate_codes` / `user_affiliates` | ✅ `affiliate_codes` (code + `markup_percent`), `user_affiliates` (user ↔ code link) |
| App-level "affiliate" | ✅ `apps.affiliate_code` (discovery), `referral_bonus_credits` | ✅ Same pattern in `apps` |

---

## 3. Services & APIs

### 3.1 Referrals service

| Capability | **cloud** | **cloud-shaw** |
|------------|-----------|-----------------|
| `getOrCreateCode(userId, tier?)` | ✅ tier default `pct_5`; tier only on create | ✅ `getOrCreateCode(userId)` — no tier param |
| `applyReferralCode(..., appContext?)` | ✅ `appContext?: { appId? }` | ✅ `appContext?: { appId?, appOwnerId?, creatorId? }` |
| `processReferralCommission(...)` | ✅ Used by **Stripe webhook** | ❌ Removed (dead code); revenue handled by `calculateRevenueSplits` |
| `calculateRevenueSplits(userId, amount)` | ❌ | ✅ 50/40/10 + multi-tier; used by **Stripe webhook** and x402 top-up |
| `getReferralStats(userId)` | ✅ includes `commissionTier` | ✅ no `commissionTier` (no tier in schema) |

### 3.2 Affiliates service (revenue)

| Capability | **cloud** | **cloud-shaw** |
|------------|-----------|-----------------|
| `getOrCreateAffiliateCode(userId, markupPercent?)` | ❌ | ✅ Default 20% markup |
| `updateMarkup(userId, percent)` | ❌ | ✅ |
| `linkUserToAffiliateCode(userId, code)` | ❌ | ✅ e.g. `/api/v1/affiliates/link` |
| `getReferrer(userId)` | ❌ | ✅ Used by auto-top-up and MCP to apply affiliate fee |

---

## 4. Where referral/affiliate is used

### 4.1 cloud

- **Stripe webhook**: after payment, `processReferralCommission(userId, amount, referrerOrgId)`.
- **Referral code**: applied at signup (wherever `applyReferralCode` is called); no app_owner/creator on signup.
- **"Affiliate"**: character/miniapp (plugin-affiliate, affiliate images, app `affiliate_code` for discovery), **not** a revenue-share code system.
- **App signup**: `app-signup-tracking` can use `affiliateCode` (app code) and `referralCode`; `referral_bonus_credits` for app-level bonus.

### 4.2 cloud-shaw

- **Stripe webhook**: **only** `calculateRevenueSplits(userId, amount)`; credits go to app_owner / creator / editor via splits.
- **Referral code**: applied at signup and in **x402 top-up** routes (`ref` / `referral_code`); `appContext` can pass `appOwnerId` (and creatorId) for 50/40/10.
- **Affiliate (revenue)**: **auto-top-up** (markup % on top-up) and **user-mcps** (affiliate fee on MCP usage); both use `affiliatesService.getReferrer(userId)`.
- **Top-up (x402)**: after credit add, `calculateRevenueSplits(user.id, AMOUNT)` and credit splits via redeemable earnings.

---

## 5. Commission / reward constants

### cloud (`lib/services/referrals.ts`)

- `COMMISSION_RATE_PCT_5`: 0.05
- `COMMISSION_RATE_PCT_50`: 1/12 (50% of margin)
- Signup/qualified bonuses: same dollar amounts as below.

### cloud-shaw (`lib/services/referrals.ts`)

- No per-code commission rate; revenue is handled entirely by 50/40/10 splits.
- 50/40/10: 50% ElizaCloud, 40% app owner, 10% creator (or 8% creator + 2% editor if `parent_referral_id` set).
- Signup/qualified: SIGNUP_BONUS $1, REFERRED_BONUS $0.50, QUALIFIED_BONUS $0.50.

---

## 6. What to port or align (if merging cloud → cloud-shaw)

1. **Commission tiers**: Add `referral_commission_tier` enum and `commission_tier` on `referral_codes` in cloud-shaw if you want 5% vs 50%-of-margin per code (like cloud).
2. **Stripe behavior**: In cloud, referral revenue is via `processReferralCommission`. In cloud-shaw it's via `calculateRevenueSplits` (50/40/10). `processReferralCommission` has been removed from cloud-shaw to prevent accidental double-pay.
3. **Referral signup shape**: cloud has no `app_owner_id`/`creator_id` on signup; cloud-shaw uses them for splits. If you add tiers to cloud-shaw, keep these for the 50/40/10 path.
4. **Affiliate (revenue)**: cloud has no `affiliate_codes`/`user_affiliates`; cloud-shaw uses them for markup and MCP. No change needed in cloud for that; if merging cloud → cloud-shaw, keep cloud-shaw's affiliate service and its usage in auto-top-up and MCP.
5. **Docs**: cloud has `docs/referrals.md` (tiers, flow, API). cloud-shaw has no equivalent; this file and any referral docs in cloud can be the basis for a single referrals + affiliates doc in cloud-shaw.

---

## 7. Revenue math audit (no over-payout)

We must never allocate more than 100% of revenue. Here is how each flow works.

### 7.1 Referral revenue splits (Stripe & x402 purchases)

- **Source of truth:** `lib/services/referrals.ts` → `REFERRAL_REVENUE_SPLITS` (exported). A startup assertion ensures `ELIZA_CLOUD + APP_OWNER + CREATOR === 1.0` and `CREATOR_TIER + EDITOR_TIER === CREATOR`.
- **Flow:** On purchase amount `P`, we split:
  - ElizaCloud: `P * 0.50` (or `P * 0.90` if no app owner).
  - App owner: `P * 0.40` (only if `app_owner_id` set).
  - Creator: `P * 0.10` (or multi-tier: creator `P * 0.08`, editor `P * 0.02`).
- **Invariant:** `calculateRevenueSplits` ends with a check: `elizaCloudAmount + sum(splits.amount) === purchaseAmount` (within float tolerance). If someone changes the constants and breaks 50+40+10 or 8+2, the service throws at runtime.
- **Result:** We never give away more than 100% of the purchase; we only redistribute it.

### 7.2 Affiliate (auto top-up)

- Customer is charged **base amount + affiliate % + platform %** (e.g. base + 20% affiliate + 20% platform). The fees are **passed to the customer**, not eaten by the platform.
- We receive `totalAmount`; we add `amount` credits to the user; we pay the affiliate their fee. Platform keeps the platform fee. No double-payout.

### 7.3 Affiliate (MCP usage)

- User is charged **creditsCharged + affiliateFeeCredits + platformFeeCredits**. Again, fees are added to what the user pays.
- Payouts: affiliate gets affiliate share; creator gets `creditsCharged * creator_share_percentage`; platform gets `creditsCharged * platform_share_percentage` + platform fee. MCP schema enforces `creator_share + platform_share = 100%`, so total paid out = total deducted.

### 7.4 No double-apply on the same transaction

- **Referral** (signup-based): used only for **Stripe checkout** and **x402 top-up** via `calculateRevenueSplits`. Not used for auto top-up or MCP.
- **Affiliate** (link-based): used only for **auto top-up** and **MCP** via `affiliatesService.getReferrer`. Not used for Stripe or x402 revenue splits.
- So a user can be both referred and affiliate-linked; no single transaction applies both referral splits and affiliate markup. We never pay 50% here and 51% there on the same dollar.

### 7.5 Signup bonuses are marketing spend, not carved from revenue

- `applyReferralCode` mints $1.50 in free credits ($1 to referrer, $0.50 to referred user). This is not deducted from any purchase — it's a growth cost.
- `checkAndQualifyReferral` mints another $0.50 to the referrer when the referred user links a social account.
- Total potential "free money" per referred user: $2.00 (if they sign up and link social). This is intentional but should be tracked as customer acquisition cost.

---

## 8. File reference

| Area | **cloud** | **cloud-shaw** |
|------|-----------|-----------------|
| Referral schema | `db/schemas/referrals.ts` | `db/schemas/referrals.ts` |
| Referral service | `lib/services/referrals.ts` | `lib/services/referrals.ts` |
| Referral repo | `db/repositories/referrals.ts` | `db/repositories/referrals.ts` |
| Affiliate (revenue) schema | — | `db/schemas/affiliates.ts` |
| Affiliate (revenue) service | — | `lib/services/affiliates.ts` |
| Stripe webhook | `app/api/stripe/webhook/route.ts` | `app/api/stripe/webhook/route.ts` |
| Referral docs | `docs/referrals.md` | — |
| App affiliate/referral | `lib/services/app-signup-tracking.ts`, `apps.affiliate_code` | Same pattern in app signup + `apps` |

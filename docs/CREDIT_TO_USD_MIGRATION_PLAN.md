# Credit System to USD Migration Plan

## Executive Summary

Migrate from abstract credit-based billing to direct USD-based billing where 1 credit = $1.00 USD, making costs transparent and human-readable.

---

## Current System Analysis

### Current Credit Economics
- **1 credit = $0.01 USD** (100 credits = $1.00)
- **Default free tier**: 50,000 credits = $500.00 worth
- **Credit multiplier**: All token costs multiplied by 100 to convert to credits

### Current Pricing Structure

#### Credit Packs
| Pack | Credits | Price | Effective Rate |
|------|---------|-------|----------------|
| Small | 50,000 | $49.99 | $0.01/credit |
| Medium | 150,000 | $129.99 | $0.009/credit |
| Large | 500,000 | $399.99 | $0.008/credit |

#### Service Costs (in current credits)
| Service | Current Cost | USD Equivalent |
|---------|--------------|----------------|
| Image Generation | 100 credits | $1.00 |
| Video Generation | 500 credits | $5.00 |
| Container Deployment | 1,000 credits | $10.00 |
| Container Running | 10 credits/hour | $0.10/hour |
| Chat (GPT-4o input) | 0.25 credits/1k tokens | $0.0025/1k tokens |

### Token Cost Calculation Formula
```typescript
inputCost = Math.ceil((inputTokens / 1000) * input_cost_per_1k * 100)
outputCost = Math.ceil((outputTokens / 1000) * output_cost_per_1k * 100)
```

**The *100 multiplier** converts real USD costs to credits.

---

## Proposed New System

### New Credit Economics
- **1 credit = $1.00 USD** (direct 1:1 mapping)
- **Default free tier**: $1.00-$5.00 worth of usage
- **No multiplier**: Token costs stored directly in USD

### New Pricing Structure

#### Credit Packs (USD-based)
| Pack | Credits | Price | Bonus | Total Credits |
|------|---------|-------|-------|---------------|
| Starter | 10 | $9.99 | 0 | 10 |
| Basic | 50 | $49.99 | 5 | 55 |
| Pro | 100 | $99.99 | 15 | 115 |
| Business | 500 | $499.99 | 100 | 600 |

#### Service Costs (in new credits/USD)
| Service | New Cost | Notes |
|---------|----------|-------|
| Image Generation | $1.00 | 1 credit |
| Video Generation | $5.00 | 5 credits |
| Container Deployment | $10.00 | 10 credits |
| Container Running | $0.10/hour | 0.1 credits/hour |
| Chat (GPT-4o input) | $0.0025/1k tokens | 0.0025 credits/1k tokens |

### New Token Cost Calculation Formula
```typescript
// Remove * 100 multiplier, use cents internally for precision
inputCostCents = Math.ceil((inputTokens / 1000) * input_cost_per_1k * 100)
outputCostCents = Math.ceil((outputTokens / 1000) * output_cost_per_1k * 100)

// Convert to credits (dollars)
inputCredits = inputCostCents / 100
outputCredits = outputCostCents / 100
```

---

## Migration Strategy

### Phase 1: Database Schema Updates

#### 1.1 Organizations Table
**File**: `db/schemas/organizations.ts`

**Changes**:
- Keep `credit_balance` column (will store dollars instead of credits)
- Add migration script to convert existing balances

**Migration**:
```sql
-- Divide all existing balances by 100 to convert credits → dollars
UPDATE organizations
SET credit_balance = credit_balance / 100;

-- Example: 50,000 credits → 500.00 dollars
```

#### 1.2 Credit Transactions Table
**File**: `db/schemas/credit-transactions.ts`

**Changes**:
- Keep existing `amount` column
- Add migration to convert all historical transactions

**Migration**:
```sql
-- Divide all transaction amounts by 100
UPDATE credit_transactions
SET amount = amount / 100;

-- Update descriptions to reflect USD
UPDATE credit_transactions
SET description = REPLACE(description, 'credits', 'USD');
```

#### 1.3 Credit Packs Table
**File**: `db/schemas/credit-packs.ts`

**Changes**:
- Update all credit pack values
- Recreate Stripe products

**Migration**:
```sql
-- Deactivate old packs
UPDATE credit_packs SET is_active = false;

-- Insert new USD-based packs
INSERT INTO credit_packs (name, description, credits, price_cents, stripe_price_id, stripe_product_id, is_active, sort_order)
VALUES
  ('Starter Pack', 'Perfect for testing', 10, 999, 'NEW_STRIPE_PRICE_ID_1', 'NEW_STRIPE_PRODUCT_ID_1', true, 1),
  ('Basic Pack', 'Best for regular usage', 55, 4999, 'NEW_STRIPE_PRICE_ID_2', 'NEW_STRIPE_PRODUCT_ID_2', true, 2),
  ('Pro Pack', 'Best value for professionals', 115, 9999, 'NEW_STRIPE_PRICE_ID_3', 'NEW_STRIPE_PRODUCT_ID_3', true, 3),
  ('Business Pack', 'For power users', 600, 49999, 'NEW_STRIPE_PRICE_ID_4', 'NEW_STRIPE_PRODUCT_ID_4', true, 4);
```

---

### Phase 2: Pricing Logic Updates

#### 2.1 Token Cost Calculation
**File**: `lib/pricing.ts`

**Current Code** (lines 38-53):
```typescript
const inputCost = Math.ceil(
  (inputTokens / 1000) *
    parseFloat(pricing.input_cost_per_1k.toString()) *
    100,
);
const outputCost = Math.ceil(
  (outputTokens / 1000) *
    parseFloat(pricing.output_cost_per_1k.toString()) *
    100,
);
```

**New Code**:
```typescript
// Calculate cost in cents for precision
const inputCostCents = Math.ceil(
  (inputTokens / 1000) *
    parseFloat(pricing.input_cost_per_1k.toString()) *
    100,
);
const outputCostCents = Math.ceil(
  (outputTokens / 1000) *
    parseFloat(pricing.output_cost_per_1k.toString()) *
    100,
);

// Convert to dollars (credits) with 2 decimal precision
const inputCost = Math.round(inputCostCents) / 100;
const outputCost = Math.round(outputCostCents) / 100;
```

**Impact**: Changes credit amounts from large integers to decimal dollars

#### 2.2 Fallback Pricing
**File**: `lib/pricing.ts` (lines 56-81)

**Update**:
```typescript
// Remove * 100, return costs in dollars
const inputCost = (inputTokens / 1000) * pricing.input;
const outputCost = (outputTokens / 1000) * pricing.output;

return {
  inputCost: Math.round(inputCost * 100) / 100, // 2 decimal places
  outputCost: Math.round(outputCost * 100) / 100,
  totalCost: Math.round((inputCost + outputCost) * 100) / 100,
};
```

#### 2.3 Service-Level Costs
**File**: `lib/pricing-constants.ts`

**Current**:
```typescript
export const IMAGE_GENERATION_COST = 100;
export const VIDEO_GENERATION_COST = 500;
```

**New**:
```typescript
export const IMAGE_GENERATION_COST = 1.00;  // $1.00
export const VIDEO_GENERATION_COST = 5.00;  // $5.00
export const VIDEO_GENERATION_FALLBACK_COST = 2.50;  // $2.50
```

**File**: `lib/constants/pricing.ts`

**Current**:
```typescript
export const CONTAINER_PRICING = {
  DEPLOYMENT: 1000,
  IMAGE_UPLOAD: 500,
  RUNNING_COST_PER_HOUR: 10,
  // ...
}
```

**New**:
```typescript
export const CONTAINER_PRICING = {
  DEPLOYMENT: 10.00,           // $10.00
  IMAGE_UPLOAD: 5.00,          // $5.00
  RUNNING_COST_PER_HOUR: 0.10, // $0.10/hour
  RUNNING_COST_PER_DAY: 2.40,  // $2.40/day
  COST_PER_GB_STORAGE: 1.00,   // $1.00/GB/month
  COST_PER_GB_BANDWIDTH: 0.50, // $0.50/GB
  COST_PER_ADDITIONAL_INSTANCE: 0.50, // $0.50 per instance/hour
}
```

#### 2.4 Container Tier Limits
**File**: `lib/constants/pricing.ts` (lines 54-65)

**Update**:
```typescript
export function getMaxContainersForOrg(
  creditBalance: number,
  orgSettings?: Record<string, unknown>,
): number {
  // ... custom limit logic ...

  // New tiering based on dollar balance
  if (creditBalance >= 1000) {
    return CONTAINER_LIMITS.ENTERPRISE_MAX_CONTAINERS; // $1000+
  }
  if (creditBalance >= 100) {
    return CONTAINER_LIMITS.PRO_MAX_CONTAINERS; // $100+
  }
  if (creditBalance >= 10) {
    return CONTAINER_LIMITS.STARTER_MAX_CONTAINERS; // $10+
  }

  return CONTAINER_LIMITS.FREE_TIER_CONTAINERS; // Below $10
}
```

---

### Phase 3: Default Credits Update

#### 3.1 Initial Credits for New Users
**File**: `lib/privy-sync.ts` (line 124)

**Current**:
```typescript
credit_balance: 50000, // Initial credits
```

**New**:
```typescript
credit_balance: 1.00, // Initial $1.00 USD (or 5.00 for $5)
```

**Recommendation**: Start with $1.00-$5.00 to encourage early adoption without excessive cost.

---

### Phase 4: Frontend Display Updates

#### 4.1 Credit Display Components

**File**: `components/billing/credit-pack-card.tsx`

**Current** (lines 37-38):
```typescript
const price = (priceCents / 100).toFixed(2);
const pricePerCredit = (priceCents / credits / 1000).toFixed(4);
```

**New**:
```typescript
const price = (priceCents / 100).toFixed(2);
const creditsInDollars = credits.toFixed(2); // Already in dollars
const pricePerDollar = (priceCents / credits / 100).toFixed(3);
```

**Display Changes**:
- Line 72: `<span>${credits.toFixed(2)} in credits ($)</span>`
- Line 65: `<div className="text-sm text-muted-foreground">${pricePerDollar} per credit dollar</div>`

#### 4.2 User Menu Balance Display
**File**: `components/layout/user-menu.tsx`

**Update balance display**:
```typescript
// Show as currency: $123.45 instead of "123,450 credits"
const balanceDisplay = `$${creditBalance.toFixed(2)}`;
```

#### 4.3 Dashboard Balance Display
**File**: `components/dashboard/dashboard-hero.tsx`

**Update**:
- Show balance as: **$XX.XX**
- Update copy: "Credit Balance" → "Account Balance"

#### 4.4 Analytics & Usage Displays
**Files to Update**:
- `components/analytics/cost-insights-card.tsx`
- `components/analytics/projections-chart.tsx`
- `components/analytics/usage-chart.tsx`

**Changes**:
- Format all credit amounts as currency: `$X.XX`
- Update axis labels from "Credits" to "USD ($)"
- Update tooltips to show dollars

---

### Phase 5: API & Service Updates

#### 5.1 Credit Deduction Logic
**File**: `lib/services/credits.ts`

**No changes needed** - uses organization's `credit_balance` which will now store dollars

**Testing Required**:
- Ensure decimal precision works (0.01 minimum)
- Test insufficient balance checks with small amounts

#### 5.2 Credit Guard Utility
**File**: `lib/utils/credit-guard.ts`

**Review**: Ensure works with decimal credits (dollars)

#### 5.3 Usage Recording
**File**: `lib/services/usage.ts`

**Update**: Ensure usage records store costs in dollars

---

### Phase 6: Documentation & Messaging Updates

#### 6.1 In-App Messaging
- Update all UI copy referencing "credits" to "account balance" or "USD"
- Update tooltips explaining costs
- Add migration notice for existing users

#### 6.2 Email Templates
- Update billing-related emails
- Notify users of balance conversion
- Explain new pricing structure

#### 6.3 API Documentation
- Update API docs to reflect USD-based pricing
- Update cost examples
- Add migration guide for API users

---

## Deployment Plan

### Pre-Deployment Checklist

#### 1. Stripe Setup
- [ ] Create new Stripe products for USD-based packs
- [ ] Update webhook handlers to use new product IDs
- [ ] Test checkout flows in Stripe test mode
- [ ] Update environment variables

#### 2. Database Backups
- [ ] Full database backup before migration
- [ ] Test restore process
- [ ] Document rollback procedure

#### 3. Testing
- [ ] Test credit deductions with decimal amounts
- [ ] Test insufficient balance scenarios
- [ ] Test credit pack purchases
- [ ] Test API token cost calculations
- [ ] Test container deployment costs
- [ ] Test image/video generation costs

### Deployment Steps

#### Step 1: Database Migration (Maintenance Window Required)
```bash
# 1. Enable maintenance mode
# 2. Backup database
pg_dump $DATABASE_URL > backup_pre_usd_migration.sql

# 3. Run migration script
psql $DATABASE_URL < migrations/credits_to_usd.sql

# 4. Verify migration
psql $DATABASE_URL -c "SELECT id, credit_balance FROM organizations LIMIT 10;"

# 5. Disable maintenance mode
```

#### Step 2: Code Deployment
```bash
# 1. Deploy new code
git checkout credits-to-usd-migration
npm run build
# Deploy to production

# 2. Restart services
pm2 restart all
```

#### Step 3: Post-Deployment Verification
- [ ] Check user balances display correctly
- [ ] Verify credit pack prices
- [ ] Test new user signup (receives $1-$5)
- [ ] Monitor error logs for decimal precision issues
- [ ] Check Stripe webhook processing

---

## Rollback Plan

### If Issues Occur:

#### 1. Database Rollback
```bash
# Restore from backup
psql $DATABASE_URL < backup_pre_usd_migration.sql
```

#### 2. Code Rollback
```bash
# Revert to previous deployment
git checkout main
npm run build
# Deploy
```

---

## Risk Analysis

### High Risk Items
1. **Decimal Precision**: Ensure database and calculations handle 2-3 decimal places
2. **Existing User Balances**: Migration must not lose or incorrectly convert balances
3. **Stripe Integration**: New product IDs must work with webhook handlers

### Medium Risk Items
1. **API Backward Compatibility**: External API users may have hardcoded credit amounts
2. **Analytics Accuracy**: Historical data must be correctly interpreted post-migration

### Low Risk Items
1. **UI Display Updates**: Easy to hotfix if formatting issues occur

---

## Success Metrics

### Technical Metrics
- Zero data loss during migration
- No user-reported billing errors
- All costs calculated to 2 decimal precision

### Business Metrics
- Improved user understanding of costs (survey/feedback)
- Reduced support tickets about pricing
- Maintained or improved conversion rates on credit pack purchases

---

## Timeline Estimate

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1: Database Schema | 2 days | None |
| Phase 2: Pricing Logic | 3 days | Phase 1 |
| Phase 3: Default Credits | 1 day | Phase 1 |
| Phase 4: Frontend Updates | 3 days | Phase 2 |
| Phase 5: API Updates | 2 days | Phase 2 |
| Phase 6: Documentation | 2 days | All phases |
| Testing | 3 days | All phases |
| **Total** | **16 days** | - |

---

## Files to Modify

### Core Pricing (Critical)
1. ✅ `lib/pricing.ts` - Token cost calculations
2. ✅ `lib/pricing-constants.ts` - Service costs
3. ✅ `lib/constants/pricing.ts` - Container costs
4. ✅ `lib/privy-sync.ts` - Default credits

### Database (Critical)
5. ✅ `db/schemas/organizations.ts` - Review decimal type
6. ✅ `db/schemas/credit-transactions.ts` - Review decimal type
7. ✅ `db/schemas/credit-packs.ts` - New pack values
8. ✅ `scripts/seed-credit-packs.ts` - New pack seeding

### Services (Critical)
9. ✅ `lib/services/credits.ts` - Already supports decimals
10. ✅ `lib/utils/credit-guard.ts` - Review decimal handling

### API Routes (High Priority)
11. ✅ `app/api/v1/chat/completions/route.ts` - Uses pricing.ts
12. ✅ `app/api/v1/generate-image/route.ts` - Update cost constant
13. ✅ `app/api/v1/generate-video/route.ts` - Update cost constant
14. ✅ `app/api/v1/containers/route.ts` - Update deployment costs

### Frontend Components (High Priority)
15. ✅ `components/billing/credit-pack-card.tsx` - Display updates
16. ✅ `components/layout/user-menu.tsx` - Balance display
17. ✅ `components/dashboard/dashboard-hero.tsx` - Balance display
18. ✅ `components/analytics/*.tsx` - All analytics displays

### Lower Priority
19. ✅ `components/billing/billing-page-client.tsx` - Review displays
20. ✅ `hooks/use-credits-stream.ts` - Review formatting

---

## User Communication Plan

### Pre-Migration (1 week before)
**Email Subject**: "Upcoming Change: Simplified Pricing"

**Content**:
- We're making pricing more transparent
- Credits will now directly represent USD ($1 = 1 credit)
- Your existing balance will be automatically converted
- Example: 50,000 credits → $500.00
- No action required from you

### During Migration (Day of)
**Banner Message**:
"We're updating our billing system to use direct USD pricing. Your balance has been converted automatically. See details →"

### Post-Migration (Day after)
**Email Subject**: "Pricing Update Complete"

**Content**:
- Migration successful
- New balance shown in your dashboard
- New credit packs available
- Link to updated documentation

---

## Open Questions

1. **What should the new free tier amount be?**
   - Option A: $1.00 (conservative, encourages upgrade)
   - Option B: $5.00 (generous, better UX)
   - Option C: $10.00 (very generous, may reduce revenue)

2. **Should we maintain backward compatibility for API users?**
   - Add API versioning (v1 uses credits, v2 uses USD)?
   - Or force migration with deprecation notice?

3. **How to handle in-flight transactions during migration?**
   - Brief maintenance window (recommended)
   - Or complex dual-write system?

4. **Should we round costs or maintain precision?**
   - Option A: Always round up (safer, may overcharge slightly)
   - Option B: Use exact decimal (fairer, more complex)

---

## Conclusion

This migration will transform the credit system from an abstract point system (1 credit = $0.01) to a transparent USD-based system (1 credit = $1.00). The changes primarily involve:

1. **Removing the *100 multiplier** from cost calculations
2. **Dividing all existing balances by 100**
3. **Updating all UI displays** to show dollars
4. **Creating new credit packs** with USD-based pricing

The migration is **backwards compatible** at the database level (same column names/types) but requires careful testing of decimal precision throughout the stack.

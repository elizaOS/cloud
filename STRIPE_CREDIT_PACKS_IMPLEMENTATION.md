# Stripe Credit Packs System Implementation Plan

## Table of Contents
1. [Overview](#overview)
2. [Implementation Todos](#implementation-todos)
3. [Architecture & Context](#architecture--context)
4. [Detailed Implementation Guide](#detailed-implementation-guide)
5. [Testing Strategy](#testing-strategy)
6. [Deployment Checklist](#deployment-checklist)

---

## Overview

### Goal
Transform the subscription-based billing system into a pay-as-you-go credit packs system where users purchase credits in bulk (Small, Medium, Large packs) via Stripe one-time payments.

### Key Changes
- **Remove**: Subscription-related fields from organizations table
- **Add**: New `credit_packs` table to store available credit pack offerings
- **Update**: Billing flow to use Stripe Checkout for one-time purchases
- **Implement**: Stripe webhook handler to automatically credit accounts after successful payment

### Credit Pack Tiers
1. **Small Pack**: 50,000 credits @ $49.99 ($0.001/credit)
2. **Medium Pack**: 150,000 credits @ $129.99 ($0.000867/credit) - Best Value
3. **Large Pack**: 500,000 credits @ $399.99 ($0.0008/credit) - Maximum Savings

---

## Implementation Todos

### ✅ Phase 1: Database Schema Updates
- [ ] **Task 1.1**: Remove subscription fields from `organizations` table
  - Remove: `stripe_subscription_id`, `stripe_product_id`, `stripe_price_id`
  - Remove: `subscription_status`, `subscription_tier`
  - Keep: `stripe_customer_id`, `billing_email`, `billing_address`, `tax_id_*`
  
- [ ] **Task 1.2**: Create `credit_packs` table with fields:
  - `id` (uuid, primary key)
  - `name` (text) - Display name (e.g., "Small Pack")
  - `description` (text) - Marketing description
  - `credits` (integer) - Number of credits in pack
  - `price_cents` (integer) - Price in cents (e.g., 4999 = $49.99)
  - `stripe_price_id` (text, unique) - Stripe Price ID
  - `stripe_product_id` (text) - Stripe Product ID
  - `is_active` (boolean) - Enable/disable packs
  - `sort_order` (integer) - Display order
  - `metadata` (jsonb) - Additional data
  - `created_at`, `updated_at` (timestamps)
  
- [ ] **Task 1.3**: Add CreditPack types to `lib/types.ts`
  - `export type CreditPack = InferSelectModel<typeof schema.creditPacks>`
  - `export type NewCreditPack = InferInsertModel<typeof schema.creditPacks>`

- [ ] **Task 1.4**: Generate and run database migration
  - Run: `npm run db:generate`
  - Review migration file in `db/migrations/`
  - Run: `npm run db:migrate`

### ✅ Phase 2: Environment Configuration
- [ ] **Task 2.1**: Update `.env.local` with Stripe keys
  ```env
  STRIPE_SECRET_KEY=sk_test_... (or sk_live_...)
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_... (or pk_live_...)
  STRIPE_WEBHOOK_SECRET=whsec_...
  NEXT_PUBLIC_APP_URL=http://localhost:3000 (or production URL)
  ```

- [ ] **Task 2.2**: Update `example.env.local` with documentation
  - Add comments explaining each Stripe variable
  - Link to Stripe dashboard for obtaining keys
  - Document webhook setup process

### ✅ Phase 3: Stripe Configuration
- [ ] **Task 3.1**: Install Stripe dependencies
  ```bash
  npm install stripe@^17.8.0 @stripe/stripe-js@^4.11.0
  ```

- [ ] **Task 3.2**: Create `lib/stripe.ts`
  - Initialize Stripe client with secret key
  - Set API version to `2025-09-30.clover`
  - Export currency constant (USD)
  - Add environment variable validation

### ✅ Phase 4: Credit Pack Queries
- [ ] **Task 4.1**: Create `lib/queries/credit-packs.ts`
  - `listActiveCreditPacks()` - Get all active packs, sorted by sort_order
  - `getCreditPackByPriceId(stripePriceId)` - Find pack by Stripe Price ID
  - `getCreditPackById(id)` - Find pack by UUID

### ✅ Phase 5: Stripe API Routes
- [ ] **Task 5.1**: Create `app/api/stripe/credit-packs/route.ts`
  - GET endpoint to fetch all active credit packs
  - Returns JSON array of credit packs
  - Public endpoint (no auth required for browsing)

- [ ] **Task 5.2**: Create `app/api/stripe/create-checkout-session/route.ts`
  - POST endpoint (requires authentication)
  - Accepts: `{ creditPackId: string }`
  - Validates credit pack exists and is active
  - Creates or retrieves Stripe customer
  - Creates Stripe Checkout session with:
    - Payment mode: 'payment' (one-time)
    - Line items: selected credit pack
    - Success URL: `/dashboard/billing/success?session_id={CHECKOUT_SESSION_ID}`
    - Cancel URL: `/dashboard/billing?canceled=true`
    - Metadata: organization_id, user_id, credit_pack_id, credits
  - Returns: `{ sessionId, url }`

- [ ] **Task 5.3**: Create `app/api/stripe/webhook/route.ts`
  - POST endpoint for Stripe webhook events
  - Verify webhook signature with `STRIPE_WEBHOOK_SECRET`
  - Handle events:
    - `checkout.session.completed`: Add credits to organization
    - `payment_intent.succeeded`: Log successful payment
    - `payment_intent.payment_failed`: Log failed payment
  - Use `addCredits()` function to credit organization account
  - Create credit transaction record with payment intent ID
  - Return 200 OK to acknowledge receipt

### ✅ Phase 6: Frontend Components
- [ ] **Task 6.1**: Create `components/billing/credit-pack-card.tsx`
  - Props: id, name, description, credits, priceCents, isPopular, onPurchase, loading
  - Display: Price, credits amount, price per 1k credits
  - Features list: One-time purchase, Never expires, Instant activation
  - "Popular" badge for recommended tier
  - Purchase button with loading state
  - Hover effects and responsive design

- [ ] **Task 6.2**: Create `components/billing/billing-page-client.tsx`
  - Client component with "use client" directive
  - Props: creditPacks[], currentCredits
  - State: loading (track which pack is being purchased)
  - Display current credit balance card
  - Grid of credit pack cards (3 columns on desktop)
  - Handle purchase flow:
    1. Call `/api/stripe/create-checkout-session`
    2. Initialize Stripe.js
    3. Redirect to Stripe Checkout
  - Error handling with toast notifications

### ✅ Phase 7: Billing Pages
- [ ] **Task 7.1**: Create `app/dashboard/billing/page.tsx`
  - Server component
  - Require authentication
  - Fetch active credit packs
  - Display page header with icon and description
  - Show "How Credits Work" info alert
  - Show cancelation alert if `?canceled=true` in URL
  - Render `<BillingPageClient>` with data

- [ ] **Task 7.2**: Create `app/dashboard/billing/success/page.tsx`
  - Server component
  - Require authentication
  - Display success message with checkmark icon
  - Show updated credit balance
  - Provide links to:
    - View Billing (billing page)
    - Go to Dashboard (main dashboard)

### ✅ Phase 8: Navigation Updates
- [ ] **Task 8.1**: Update `components/layout/sidebar-data.ts`
  - Add "Billing" item to "Settings" section
  - Import `CreditCard` icon from lucide-react
  - Route: `/dashboard/billing`
  - Position: Between "Account" and "API Keys"

### ✅ Phase 9: Organization Component Updates
- [ ] **Task 9.1**: Update `components/account/organization-info.tsx`
  - Remove "Subscription Tier" display section
  - Remove "Subscription Status" display section
  - Keep credit balance display
  - Enhance credit balance with link to billing page

- [ ] **Task 9.2**: Update `components/dashboard/plan-limits-card.tsx`
  - Remove `subscriptionTier` prop
  - Remove tier-based limit displays
  - Focus on usage-based limits (credit balance, API usage)

### ✅ Phase 10: Stripe Product Setup & Seeding
- [ ] **Task 10.1**: Create products in Stripe Dashboard
  1. Go to https://dashboard.stripe.com/products
  2. Create "Small Credit Pack" - One-time payment $49.99
  3. Create "Medium Credit Pack" - One-time payment $129.99
  4. Create "Large Credit Pack" - One-time payment $399.99
  5. Copy Price IDs (price_xxx) and Product IDs (prod_xxx)

- [ ] **Task 10.2**: Create `scripts/seed-credit-packs.ts`
  - Script to insert credit packs into database
  - Use real Stripe Price IDs and Product IDs
  - Install tsx: `npm install -D tsx`
  - Add script to package.json: `"seed:credit-packs": "tsx scripts/seed-credit-packs.ts"`

- [ ] **Task 10.3**: Update seed script with real Stripe IDs
  - Replace placeholder Price IDs
  - Replace placeholder Product IDs
  - Run: `npm run seed:credit-packs`

### ✅ Phase 11: Stripe Webhook Setup
- [ ] **Task 11.1**: Set up webhook endpoint in Stripe
  - **For Local Development**:
    1. Install Stripe CLI: `brew install stripe/stripe-cli/stripe` (macOS)
    2. Login: `stripe login`
    3. Forward webhooks: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
    4. Copy webhook secret (whsec_xxx) to `.env.local`
  
  - **For Production**:
    1. Go to https://dashboard.stripe.com/webhooks
    2. Add endpoint: `https://yourdomain.com/api/stripe/webhook`
    3. Select events: `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`
    4. Copy signing secret to production environment

### ✅ Phase 12: Documentation
- [ ] **Task 12.1**: Create `docs/STRIPE_SETUP.md`
  - Prerequisites and account setup
  - How to get API keys
  - How to create products and prices
  - Webhook configuration (local and production)
  - Testing with Stripe test cards
  - Going live checklist

- [ ] **Task 12.2**: Update main README.md
  - Add "Billing & Credits" section
  - Link to Stripe setup guide
  - Document credit system overview

### ✅ Phase 13: Testing & Validation
- [ ] **Task 13.1**: Database migration testing
  - Backup production database before migration
  - Test migration on staging environment
  - Verify no data loss
  - Verify credit_packs table created correctly

- [ ] **Task 13.2**: Purchase flow testing
  - Test with Stripe test cards
  - Verify checkout session creation
  - Verify redirect to Stripe
  - Complete test purchase
  - Verify credits added to account
  - Verify credit transaction recorded

- [ ] **Task 13.3**: Webhook testing
  - Test with Stripe CLI locally
  - Verify webhook signature validation
  - Test successful payment event
  - Test failed payment event
  - Verify idempotency (duplicate events)

- [ ] **Task 13.4**: UI/UX testing
  - Test responsive design (mobile, tablet, desktop)
  - Test loading states
  - Test error states
  - Test navigation flow
  - Test accessibility (keyboard navigation, screen readers)

- [ ] **Task 13.5**: Edge case testing
  - Invalid credit pack ID
  - Expired/inactive credit pack
  - Concurrent purchases
  - Network errors during checkout
  - Webhook delivery failures

---

## Architecture & Context

### Why Remove Subscriptions?

**Current Problem**: Subscription-based billing creates predictable recurring revenue but may not align with actual usage patterns. Users might:
- Overpay for credits they don't use
- Run out of credits mid-month
- Face friction with cancellation processes

**Solution**: Pay-as-you-go credit packs provide:
- ✅ Flexibility - Buy only what you need
- ✅ No recurring charges - One-time purchases
- ✅ Better value perception - Bulk discounts visible
- ✅ Simpler billing - No proration or subscription management

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     User Interface                          │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────┐     │
│  │ Billing    │  │ Credit     │  │ Success          │     │
│  │ Page       │→ │ Pack       │→ │ Page             │     │
│  └────────────┘  │ Cards      │  └──────────────────┘     │
│                  └────────────┘                             │
└────────────────────┬────────────────────────────────────────┘
                     │ User clicks "Purchase"
                     ↓
┌─────────────────────────────────────────────────────────────┐
│                   Next.js API Routes                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ POST /api/stripe/create-checkout-session            │  │
│  │  1. Validate credit pack                             │  │
│  │  2. Get/create Stripe customer                       │  │
│  │  3. Create Checkout Session                          │  │
│  │  4. Return session URL                               │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────────┘
                     │ Redirect to Stripe
                     ↓
┌─────────────────────────────────────────────────────────────┐
│                   Stripe Checkout                           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  - User enters payment info                          │  │
│  │  - Stripe processes payment                          │  │
│  │  - Redirects back to success page                    │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────────┘
                     │ Payment complete
                     ↓
┌─────────────────────────────────────────────────────────────┐
│                   Stripe Webhook                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ POST /api/stripe/webhook                             │  │
│  │  1. Verify signature                                 │  │
│  │  2. Handle checkout.session.completed                │  │
│  │  3. Extract metadata (org_id, credits)               │  │
│  │  4. Call addCredits()                                │  │
│  │  5. Create credit transaction                        │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────────┘
                     │ Credits added
                     ↓
┌─────────────────────────────────────────────────────────────┐
│                      Database                               │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │ organizations│  │ credit_packs │  │ credit_         │  │
│  │  - credit_   │  │  - id        │  │ transactions    │  │
│  │    balance   │  │  - name      │  │  - amount       │  │
│  │  (updated)   │  │  - credits   │  │  - type:purchase│  │
│  └──────────────┘  │  - price     │  │  - payment_id   │  │
│                    └──────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

#### 1. Purchase Initiation
```typescript
// User clicks "Purchase Credits" button
const handlePurchase = async (creditPackId: string) => {
  // Call API to create checkout session
  const response = await fetch("/api/stripe/create-checkout-session", {
    method: "POST",
    body: JSON.stringify({ creditPackId }),
  });
  
  const { sessionId } = await response.json();
  
  // Redirect to Stripe Checkout
  const stripe = await loadStripe(PUBLISHABLE_KEY);
  await stripe.redirectToCheckout({ sessionId });
};
```

#### 2. Checkout Session Creation
```typescript
// Server-side: Create Stripe Checkout Session
const session = await stripe.checkout.sessions.create({
  customer: customerId,
  mode: 'payment', // One-time payment
  line_items: [{
    price: creditPack.stripe_price_id,
    quantity: 1,
  }],
  success_url: `${APP_URL}/dashboard/billing/success?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${APP_URL}/dashboard/billing?canceled=true`,
  metadata: {
    organization_id: user.organization_id,
    user_id: user.id,
    credit_pack_id: creditPackId,
    credits: creditPack.credits.toString(),
  },
});
```

#### 3. Webhook Processing
```typescript
// Stripe sends webhook after successful payment
const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);

if (event.type === 'checkout.session.completed') {
  const session = event.data.object;
  const { organization_id, credits, user_id } = session.metadata;
  
  // Add credits to organization
  await addCredits(
    organization_id,
    parseInt(credits),
    'purchase',
    `Credit pack purchase - ${credits} credits`,
    user_id,
    session.payment_intent
  );
}
```

### Database Schema Changes

#### Before (Subscription Model)
```typescript
organizations {
  id: uuid
  credit_balance: integer
  stripe_customer_id: text
  stripe_subscription_id: text      // ❌ REMOVE
  stripe_product_id: text           // ❌ REMOVE
  stripe_price_id: text             // ❌ REMOVE
  subscription_status: text         // ❌ REMOVE
  subscription_tier: text           // ❌ REMOVE
  billing_email: text
  // ... other fields
}
```

#### After (Credit Packs Model)
```typescript
organizations {
  id: uuid
  credit_balance: integer           // ✅ KEEP
  stripe_customer_id: text          // ✅ KEEP (for one-time purchases)
  billing_email: text               // ✅ KEEP
  // ... other fields
}

// ✅ NEW TABLE
credit_packs {
  id: uuid
  name: text                        // "Small Pack"
  description: text                 // "Perfect for testing"
  credits: integer                  // 50000
  price_cents: integer              // 4999 ($49.99)
  stripe_price_id: text (unique)    // "price_xxx" from Stripe
  stripe_product_id: text           // "prod_xxx" from Stripe
  is_active: boolean                // Enable/disable packs
  sort_order: integer               // Display order
  metadata: jsonb                   // Additional data
  created_at: timestamp
  updated_at: timestamp
}

// ✅ EXISTING (enhanced)
credit_transactions {
  id: uuid
  organization_id: uuid
  user_id: uuid
  amount: integer                   // Credits added/deducted
  type: text                        // 'purchase', 'usage', 'adjustment'
  description: text
  stripe_payment_intent_id: text    // Link to Stripe payment
  metadata: jsonb
  created_at: timestamp
}
```

### Credit Calculation

**Why Credits?**
- Abstract unit that normalizes costs across different AI operations
- 1 credit ≈ 1 token for text generation
- Images/videos have fixed credit costs based on complexity

**Example Costs**:
- GPT-4 Text (1K tokens): ~1,000 credits
- Image Generation (512x512): ~5,000 credits
- Image Generation (1024x1024): ~10,000 credits
- Video Generation (5s): ~50,000 credits

**Pack Economics**:
| Pack   | Credits  | Price   | Per Credit | Savings |
|--------|----------|---------|------------|---------|
| Small  | 50,000   | $49.99  | $0.001000  | -       |
| Medium | 150,000  | $129.99 | $0.000867  | 13.3%   |
| Large  | 500,000  | $399.99 | $0.000800  | 20.0%   |

### Security Considerations

#### 1. Webhook Signature Verification
```typescript
// CRITICAL: Always verify webhook signatures
const signature = headers.get('stripe-signature');
const event = stripe.webhooks.constructEvent(
  body,
  signature,
  STRIPE_WEBHOOK_SECRET // Must match Stripe dashboard
);
```

**Why?** Prevents attackers from forging webhook requests to add credits without payment.

#### 2. Metadata Validation
```typescript
// Validate metadata from webhook
const { organization_id, credits } = session.metadata;

if (!organization_id || !credits) {
  throw new Error('Missing required metadata');
}

// Verify organization exists
const org = await db.query.organizations.findFirst({
  where: eq(organizations.id, organization_id)
});

if (!org) {
  throw new Error('Invalid organization');
}
```

#### 3. Idempotency
```typescript
// Check if payment already processed
const existingTransaction = await db.query.creditTransactions.findFirst({
  where: eq(creditTransactions.stripe_payment_intent_id, paymentIntentId)
});

if (existingTransaction) {
  console.log('Payment already processed');
  return; // Don't add credits twice
}
```

**Why?** Stripe may send duplicate webhook events. Idempotency ensures credits are only added once.

#### 4. Rate Limiting
- Add rate limiting to checkout session endpoint to prevent abuse
- Limit: 10 checkout sessions per organization per hour

### Error Handling

#### Client-Side Errors
```typescript
try {
  // Create checkout session
  const response = await fetch('/api/stripe/create-checkout-session', {
    method: 'POST',
    body: JSON.stringify({ creditPackId }),
  });

  if (!response.ok) {
    throw new Error('Failed to create checkout session');
  }

  // Redirect to Stripe
  const stripe = await loadStripe(PUBLISHABLE_KEY);
  const { error } = await stripe.redirectToCheckout({ sessionId });

  if (error) {
    throw error;
  }
} catch (error) {
  console.error('Purchase error:', error);
  toast.error('Failed to initiate purchase. Please try again.');
}
```

#### Server-Side Errors
```typescript
// API route error handling
try {
  // ... create checkout session
} catch (error) {
  console.error('Error creating checkout session:', error);
  
  return NextResponse.json(
    { error: 'Failed to create checkout session' },
    { status: 500 }
  );
}
```

#### Webhook Errors
```typescript
// Webhook error handling
try {
  // Process webhook event
  await addCredits(...);
} catch (error) {
  console.error('Error processing webhook:', error);
  
  // Return 500 so Stripe retries
  return NextResponse.json(
    { error: 'Webhook processing failed' },
    { status: 500 }
  );
}
```

**Stripe Retry Logic**: If webhook returns non-200 status, Stripe will automatically retry with exponential backoff.

### Testing Strategy

#### 1. Stripe Test Mode
- Use test API keys (pk_test_..., sk_test_...)
- Test cards:
  - **Success**: 4242 4242 4242 4242
  - **Decline**: 4000 0000 0000 0002
  - **3D Secure**: 4000 0025 0000 3155

#### 2. Local Webhook Testing
```bash
# Terminal 1: Start Next.js dev server
npm run dev

# Terminal 2: Forward webhooks with Stripe CLI
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

#### 3. Integration Testing Flow
1. Navigate to `/dashboard/billing`
2. Click "Purchase Credits" on a pack
3. Redirected to Stripe Checkout
4. Enter test card: 4242 4242 4242 4242
5. Complete purchase
6. Verify redirect to success page
7. Check database for:
   - Updated organization.credit_balance
   - New credit_transactions record
8. Check webhook logs for processing confirmation

#### 4. Edge Case Testing
- [ ] Purchase while already at checkout
- [ ] Close checkout and restart
- [ ] Network failure during redirect
- [ ] Webhook arrives before redirect complete
- [ ] Duplicate webhook events
- [ ] Invalid credit pack ID
- [ ] Inactive credit pack
- [ ] Missing Stripe customer

---

## Detailed Implementation Guide

### Step 1: Database Migration

#### 1.1 Update Schema File
Edit `db/schema.ts`:

```typescript
// Remove these lines from organizations table (lines 26-29, 34):
stripe_subscription_id: text("stripe_subscription_id"),
stripe_product_id: text("stripe_product_id"),
stripe_price_id: text("stripe_price_id"),
subscription_status: text("subscription_status"),
subscription_tier: text("subscription_tier").default("free"),

// Add new table after creditTransactions (after line 202):
export const creditPacks = pgTable(
  "credit_packs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    credits: integer("credits").notNull(),
    price_cents: integer("price_cents").notNull(),
    stripe_price_id: text("stripe_price_id").notNull().unique(),
    stripe_product_id: text("stripe_product_id").notNull(),
    is_active: boolean("is_active").notNull().default(true),
    sort_order: integer("sort_order").default(0),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    stripe_price_idx: index("credit_packs_stripe_price_idx").on(table.stripe_price_id),
    active_idx: index("credit_packs_active_idx").on(table.is_active),
    sort_idx: index("credit_packs_sort_idx").on(table.sort_order),
  }),
);
```

#### 1.2 Update Types File
Edit `lib/types.ts` (add after line 21):

```typescript
export type CreditPack = InferSelectModel<typeof schema.creditPacks>;
export type NewCreditPack = InferInsertModel<typeof schema.creditPacks>;
```

#### 1.3 Generate Migration
```bash
npm run db:generate
```

This creates a migration file in `db/migrations/`. Review it carefully before applying.

#### 1.4 Apply Migration
```bash
# Backup database first!
npm run db:migrate
```

### Step 2: Install Dependencies

```bash
# Stripe SDK
npm install stripe@^17.8.0

# Stripe.js for frontend
npm install @stripe/stripe-js@^4.11.0

# TypeScript execution for seed scripts
npm install -D tsx
```

### Step 3: Create Stripe Configuration

Create `lib/stripe.ts`:

```typescript
import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set in environment variables');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-09-30.clover',
  typescript: true,
});

export const STRIPE_CURRENCY = 'usd';
```

### Step 4: Set Up Stripe Dashboard

#### 4.1 Create Products
1. Go to https://dashboard.stripe.com/test/products
2. Click "Add product"

**Small Pack**:
- Name: Small Credit Pack
- Description: 50,000 credits for AI generations. Perfect for testing and small projects.
- Pricing model: One time
- Price: $49.99 USD
- Save and copy **Price ID** (starts with `price_`)

**Medium Pack**:
- Name: Medium Credit Pack
- Description: 150,000 credits for AI generations. Best value for regular usage.
- Pricing model: One time
- Price: $129.99 USD
- Save and copy **Price ID**

**Large Pack**:
- Name: Large Credit Pack
- Description: 500,000 credits for AI generations. Maximum savings for power users.
- Pricing model: One time
- Price: $399.99 USD
- Save and copy **Price ID**

### Step 5: Create Seed Script

Create `scripts/seed-credit-packs.ts`:

```typescript
import { config } from "dotenv";
import { db } from "../db/drizzle";
import * as schema from "../db/schema";

config({ path: ".env.local" });

const creditPacks = [
  {
    name: "Small Pack",
    description: "Perfect for testing and small projects",
    credits: 50000,
    price_cents: 4999,
    stripe_price_id: "price_YOUR_SMALL_PACK_PRICE_ID", // Replace!
    stripe_product_id: "prod_YOUR_SMALL_PACK_PRODUCT_ID", // Replace!
    sort_order: 1,
  },
  {
    name: "Medium Pack",
    description: "Best value for regular usage",
    credits: 150000,
    price_cents: 12999,
    stripe_price_id: "price_YOUR_MEDIUM_PACK_PRICE_ID", // Replace!
    stripe_product_id: "prod_YOUR_MEDIUM_PACK_PRODUCT_ID", // Replace!
    sort_order: 2,
  },
  {
    name: "Large Pack",
    description: "Maximum savings for power users",
    credits: 500000,
    price_cents: 39999,
    stripe_price_id: "price_YOUR_LARGE_PACK_PRICE_ID", // Replace!
    stripe_product_id: "prod_YOUR_LARGE_PACK_PRODUCT_ID", // Replace!
    sort_order: 3,
  },
];

async function seedCreditPacks() {
  console.log("Seeding credit packs...");
  
  for (const pack of creditPacks) {
    const [result] = await db
      .insert(schema.creditPacks)
      .values(pack)
      .returning();
    console.log(`✓ Created: ${pack.name} (${result.id})`);
  }
  
  console.log("✓ Credit packs seeded successfully!");
}

seedCreditPacks()
  .then(() => {
    console.log("Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error seeding credit packs:", error);
    process.exit(1);
  });
```

Update `package.json` scripts:
```json
"seed:credit-packs": "tsx scripts/seed-credit-packs.ts"
```

Replace the placeholder IDs with real Stripe IDs, then run:
```bash
npm run seed:credit-packs
```

### Step 6: Create Query Functions

Create `lib/queries/credit-packs.ts`:

```typescript
import { db } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import type { CreditPack } from "@/lib/types";

export async function listActiveCreditPacks(): Promise<CreditPack[]> {
  return await db.query.creditPacks.findMany({
    where: eq(schema.creditPacks.is_active, true),
    orderBy: [schema.creditPacks.sort_order, schema.creditPacks.price_cents],
  });
}

export async function getCreditPackByPriceId(
  stripePriceId: string
): Promise<CreditPack | undefined> {
  return await db.query.creditPacks.findFirst({
    where: eq(schema.creditPacks.stripe_price_id, stripePriceId),
  });
}

export async function getCreditPackById(
  id: string
): Promise<CreditPack | undefined> {
  return await db.query.creditPacks.findFirst({
    where: eq(schema.creditPacks.id, id),
  });
}
```

### Step 7: Create API Routes

#### 7.1 Credit Packs List
Create `app/api/stripe/credit-packs/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { listActiveCreditPacks } from '@/lib/queries/credit-packs';

export async function GET() {
  try {
    const creditPacks = await listActiveCreditPacks();
    return NextResponse.json({ creditPacks }, { status: 200 });
  } catch (error) {
    console.error('Error fetching credit packs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch credit packs' },
      { status: 500 }
    );
  }
}
```

#### 7.2 Create Checkout Session
Create `app/api/stripe/create-checkout-session/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { stripe, STRIPE_CURRENCY } from '@/lib/stripe';
import { getCreditPackById } from '@/lib/queries/credit-packs';
import { db } from '@/db/drizzle';
import * as schema from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const { creditPackId } = await req.json();

    if (!creditPackId) {
      return NextResponse.json(
        { error: 'Credit pack ID is required' },
        { status: 400 }
      );
    }

    const creditPack = await getCreditPackById(creditPackId);
    if (!creditPack || !creditPack.is_active) {
      return NextResponse.json(
        { error: 'Invalid or inactive credit pack' },
        { status: 404 }
      );
    }

    // Get or create Stripe customer
    let customerId = user.organization.stripe_customer_id;
    
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.organization.billing_email || user.email,
        name: user.organization.name,
        metadata: {
          organization_id: user.organization_id,
        },
      });
      customerId = customer.id;

      // Save customer ID to database
      await db
        .update(schema.organizations)
        .set({
          stripe_customer_id: customerId,
          updated_at: new Date(),
        })
        .where(eq(schema.organizations.id, user.organization_id));
    }

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: creditPack.stripe_price_id,
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?canceled=true`,
      metadata: {
        organization_id: user.organization_id,
        user_id: user.id,
        credit_pack_id: creditPackId,
        credits: creditPack.credits.toString(),
      },
    });

    return NextResponse.json({ sessionId: session.id, url: session.url }, { status: 200 });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
```

#### 7.3 Webhook Handler
Create `app/api/stripe/webhook/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { addCredits } from '@/lib/queries/credits';
import { headers } from 'next/headers';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const headersList = await headers();
  const signature = headersList.get('stripe-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'No signature provided' },
      { status: 400 }
    );
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json(
      { error: 'Webhook signature verification failed' },
      { status: 400 }
    );
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        
        if (session.payment_status === 'paid') {
          const organizationId = session.metadata?.organization_id;
          const userId = session.metadata?.user_id;
          const credits = parseInt(session.metadata?.credits || '0', 10);
          const paymentIntentId = session.payment_intent as string;

          if (organizationId && credits > 0) {
            await addCredits(
              organizationId,
              credits,
              'purchase',
              `Credit pack purchase - ${credits.toLocaleString()} credits`,
              userId,
              paymentIntentId
            );
            
            console.log(`✓ Added ${credits} credits to organization ${organizationId}`);
          }
        }
        break;
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        console.log('Payment intent succeeded:', paymentIntent.id);
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object;
        console.error('Payment intent failed:', paymentIntent.id);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}
```

### Step 8: Create Frontend Components

#### 8.1 Credit Pack Card
Create `components/billing/credit-pack-card.tsx`:

```typescript
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface CreditPackCardProps {
  id: string;
  name: string;
  description: string | null;
  credits: number;
  priceCents: number;
  isPopular?: boolean;
  onPurchase: (id: string) => void;
  loading?: boolean;
}

export function CreditPackCard({
  id,
  name,
  description,
  credits,
  priceCents,
  isPopular = false,
  onPurchase,
  loading = false,
}: CreditPackCardProps) {
  const price = (priceCents / 100).toFixed(2);
  const pricePerCredit = (priceCents / credits).toFixed(4);

  return (
    <Card className={cn(
      "relative overflow-hidden transition-all hover:shadow-lg",
      isPopular && "border-primary shadow-md"
    )}>
      {isPopular && (
        <div className="absolute top-0 right-0">
          <Badge className="rounded-none rounded-bl-lg bg-primary">
            <Sparkles className="mr-1 h-3 w-3" />
            Popular
          </Badge>
        </div>
      )}
      
      <CardHeader>
        <CardTitle className="text-2xl">{name}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div>
          <div className="text-4xl font-bold">${price}</div>
          <div className="text-sm text-muted-foreground">
            ${pricePerCredit} per 1k credits
          </div>
        </div>
        
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Check className="h-4 w-4 text-primary" />
            <span>{credits.toLocaleString()} credits</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Check className="h-4 w-4 text-primary" />
            <span>One-time purchase</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Check className="h-4 w-4 text-primary" />
            <span>Never expires</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Check className="h-4 w-4 text-primary" />
            <span>Instant activation</span>
          </div>
        </div>
      </CardContent>
      
      <CardFooter>
        <Button
          onClick={() => onPurchase(id)}
          disabled={loading}
          className="w-full"
          size="lg"
          variant={isPopular ? "default" : "outline"}
        >
          {loading ? "Processing..." : "Purchase Credits"}
        </Button>
      </CardFooter>
    </Card>
  );
}
```

#### 8.2 Billing Page Client
Create `components/billing/billing-page-client.tsx`:

```typescript
"use client";

import { useState } from "react";
import { CreditPackCard } from "./credit-pack-card";
import { toast } from "sonner";
import { loadStripe } from "@stripe/stripe-js";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

interface CreditPack {
  id: string;
  name: string;
  description: string | null;
  credits: number;
  price_cents: number;
  stripe_price_id: string;
  is_active: boolean;
  sort_order: number;
}

interface BillingPageClientProps {
  creditPacks: CreditPack[];
  currentCredits: number;
}

export function BillingPageClient({
  creditPacks,
  currentCredits,
}: BillingPageClientProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const handlePurchase = async (creditPackId: string) => {
    try {
      setLoading(creditPackId);

      const response = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ creditPackId }),
      });

      if (!response.ok) {
        throw new Error("Failed to create checkout session");
      }

      const { sessionId } = await response.json();

      const stripe = await stripePromise;
      if (!stripe) {
        throw new Error("Stripe failed to load");
      }

      const { error } = await stripe.redirectToCheckout({ sessionId });

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error("Purchase error:", error);
      toast.error("Failed to initiate purchase. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  // Determine which pack is popular (middle one)
  const middleIndex = Math.floor(creditPacks.length / 2);

  return (
    <div className="space-y-8">
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Current Balance</h3>
            <p className="text-sm text-muted-foreground">
              Available credits in your account
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">
              {currentCredits.toLocaleString()}
            </div>
            <div className="text-sm text-muted-foreground">credits</div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {creditPacks.map((pack, index) => (
          <CreditPackCard
            key={pack.id}
            id={pack.id}
            name={pack.name}
            description={pack.description}
            credits={pack.credits}
            priceCents={pack.price_cents}
            isPopular={index === middleIndex}
            onPurchase={handlePurchase}
            loading={loading === pack.id}
          />
        ))}
      </div>
    </div>
  );
}
```

### Step 9: Create Pages

#### 9.1 Billing Page
Create `app/dashboard/billing/page.tsx`:

```typescript
import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { listActiveCreditPacks } from "@/lib/queries/credit-packs";
import { BillingPageClient } from "@/components/billing/billing-page-client";
import { CreditCard, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const metadata: Metadata = {
  title: "Billing",
  description: "Purchase credits and manage your billing",
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ canceled?: string }>;
}) {
  const user = await requireAuth();
  const creditPacks = await listActiveCreditPacks();
  const params = await searchParams;

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600">
            <CreditCard className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Billing & Credits</h1>
            <p className="text-muted-foreground mt-1">
              Purchase credit packs to power your AI generations
            </p>
          </div>
        </div>
      </div>

      {params.canceled && (
        <Alert variant="destructive">
          <Info className="h-4 w-4" />
          <AlertTitle>Payment Canceled</AlertTitle>
          <AlertDescription>
            Your payment was canceled. No charges were made.
          </AlertDescription>
        </Alert>
      )}

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>How Credits Work</AlertTitle>
        <AlertDescription>
          Credits are used to power all AI operations including text generation, image
          creation, and video rendering. Purchase credits in bulk to get better rates.
          Credits never expire and are shared across your organization.
        </AlertDescription>
      </Alert>

      <BillingPageClient
        creditPacks={creditPacks}
        currentCredits={user.organization.credit_balance}
      />
    </div>
  );
}
```

#### 9.2 Success Page
Create `app/dashboard/billing/success/page.tsx`:

```typescript
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, ArrowRight } from "lucide-react";
import { requireAuth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Purchase Successful",
  description: "Your credit purchase was successful",
};

export default async function BillingSuccessPage() {
  const user = await requireAuth();

  return (
    <div className="flex items-center justify-center min-h-[80vh]">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
            <CheckCircle className="h-10 w-10 text-green-500" />
          </div>
          <CardTitle className="text-2xl">Purchase Successful!</CardTitle>
          <CardDescription>
            Your credits have been added to your account
          </CardDescription>
        </CardHeader>
        
        <CardContent className="text-center space-y-4">
          <div className="rounded-lg border bg-muted/50 p-4">
            <div className="text-sm text-muted-foreground">Current Balance</div>
            <div className="text-3xl font-bold mt-1">
              {user.organization.credit_balance.toLocaleString()}
            </div>
            <div className="text-sm text-muted-foreground">credits</div>
          </div>
          
          <p className="text-sm text-muted-foreground">
            You can now use your credits for text generation, image creation, and video rendering.
          </p>
        </CardContent>
        
        <CardFooter className="flex gap-2">
          <Button asChild variant="outline" className="w-full">
            <Link href="/dashboard/billing">View Billing</Link>
          </Button>
          <Button asChild className="w-full">
            <Link href="/dashboard">
              Go to Dashboard
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
```

### Step 10: Update Navigation

Find and edit `components/layout/sidebar-data.ts`:

```typescript
import { CreditCard } from "lucide-react"; // Add this import

// In the Settings section, add:
{
  id: "billing",
  label: "Billing",
  href: "/dashboard/billing",
  icon: CreditCard,
}
```

### Step 11: Set Up Webhooks

#### Local Development
```bash
# Install Stripe CLI (macOS)
brew install stripe/stripe-cli/stripe

# Login to Stripe
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/api/stripe/webhook

# Copy the webhook signing secret (whsec_xxx) to .env.local
# STRIPE_WEBHOOK_SECRET=whsec_xxx
```

#### Production
1. Go to https://dashboard.stripe.com/webhooks
2. Click "Add endpoint"
3. Endpoint URL: `https://yourdomain.com/api/stripe/webhook`
4. Select events:
   - `checkout.session.completed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
5. Copy signing secret
6. Add to production environment: `STRIPE_WEBHOOK_SECRET=whsec_xxx`

---

## Testing Strategy

### Pre-Flight Checklist
- [ ] Database migration applied successfully
- [ ] All environment variables set in `.env.local`
- [ ] Stripe products created with correct prices
- [ ] Seed script run with real Stripe IDs
- [ ] Stripe CLI listening for local webhooks
- [ ] Dev server running

### Test Scenarios

#### ✅ Scenario 1: Happy Path Purchase
1. Navigate to http://localhost:3000/dashboard/billing
2. Verify all 3 credit packs display with correct info
3. Click "Purchase Credits" on Medium Pack
4. Verify redirect to Stripe Checkout
5. Enter test card: `4242 4242 4242 4242`
6. Expiry: Any future date (e.g., 12/34)
7. CVC: Any 3 digits (e.g., 123)
8. ZIP: Any 5 digits (e.g., 12345)
9. Click "Pay"
10. Verify redirect to success page
11. Verify credit balance updated
12. Check Stripe CLI output for webhook event
13. Check database:
    ```sql
    SELECT * FROM credit_transactions 
    WHERE type = 'purchase' 
    ORDER BY created_at DESC LIMIT 1;
    ```

#### ❌ Scenario 2: Declined Payment
1. Navigate to billing page
2. Click "Purchase Credits"
3. Enter declined test card: `4000 0000 0000 0002`
4. Complete checkout form
5. Verify payment declined error
6. Verify no credits added
7. Verify no credit transaction created

#### 🔄 Scenario 3: Canceled Checkout
1. Navigate to billing page
2. Click "Purchase Credits"
3. On Stripe Checkout, click back arrow
4. Verify redirect to billing page with `?canceled=true`
5. Verify "Payment Canceled" alert displays
6. Verify no credits added

#### 🔐 Scenario 4: Webhook Signature Validation
1. Send POST to webhook endpoint with invalid signature:
   ```bash
   curl -X POST http://localhost:3000/api/stripe/webhook \
     -H "stripe-signature: invalid" \
     -d '{}'
   ```
2. Verify 400 Bad Request response
3. Verify error logged: "Webhook signature verification failed"

#### 🔁 Scenario 5: Duplicate Webhook Events
1. Complete a purchase
2. Manually trigger webhook event twice (using Stripe CLI):
   ```bash
   stripe trigger checkout.session.completed
   ```
3. Verify credits only added once
4. Check for duplicate payment intent ID handling

### Performance Testing
- [ ] Load billing page with 10+ credit packs
- [ ] Concurrent purchases from same organization
- [ ] Checkout session creation under load (100 req/min)
- [ ] Webhook processing latency (<500ms per event)

### Security Testing
- [ ] Attempt checkout without authentication
- [ ] Attempt checkout with inactive credit pack
- [ ] Attempt checkout with non-existent credit pack ID
- [ ] Send webhook with forged signature
- [ ] Send webhook with tampered metadata
- [ ] SQL injection in credit pack ID parameter

### Browser Compatibility
- [ ] Chrome/Edge (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)

---

## Deployment Checklist

### Pre-Deployment
- [ ] All tests passing
- [ ] Code reviewed
- [ ] Documentation complete
- [ ] Backup production database
- [ ] Staging environment tested end-to-end

### Environment Variables
Production `.env` must have:
```env
STRIPE_SECRET_KEY=sk_live_xxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx (from production webhook)
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

### Stripe Configuration
- [ ] Switch from test mode to live mode in Stripe dashboard
- [ ] Create production products with same prices
- [ ] Update seed script with live Price IDs and Product IDs
- [ ] Run seed script on production database
- [ ] Set up production webhook endpoint
- [ ] Test webhook delivery with Stripe CLI in live mode

### Database
- [ ] Run migration on staging first
- [ ] Backup production database
- [ ] Run migration on production
- [ ] Verify tables created correctly
- [ ] Run seed script on production
- [ ] Verify credit packs inserted

### Monitoring
Set up alerts for:
- [ ] Failed webhook deliveries (Stripe dashboard)
- [ ] 500 errors on checkout session endpoint
- [ ] 500 errors on webhook endpoint
- [ ] Unusual credit balance changes
- [ ] High checkout session creation rate (possible abuse)

### Post-Deployment
- [ ] Test full purchase flow in production
- [ ] Monitor webhook event logs for 24 hours
- [ ] Check for any error spikes
- [ ] Verify analytics tracking
- [ ] Announce feature to users

---

## Troubleshooting

### Issue: "Webhook signature verification failed"
**Cause**: Mismatch between webhook secret in code and Stripe dashboard

**Solution**:
1. Check `.env.local` has correct `STRIPE_WEBHOOK_SECRET`
2. In Stripe CLI output, copy the exact `whsec_xxx` value
3. Restart dev server after updating `.env.local`
4. For production, verify webhook secret matches Stripe dashboard

### Issue: Credits not added after successful payment
**Cause**: Webhook not reaching server or processing error

**Solution**:
1. Check Stripe CLI output for webhook events
2. Check server logs for webhook processing errors
3. Verify webhook endpoint is publicly accessible (production)
4. Check Stripe dashboard > Webhooks > Event logs
5. Manually retry failed event from Stripe dashboard

### Issue: "Stripe failed to load" error
**Cause**: Invalid or missing Stripe publishable key

**Solution**:
1. Verify `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` in `.env.local`
2. Ensure key starts with `pk_test_` or `pk_live_`
3. Restart dev server after updating
4. Check browser console for Stripe.js loading errors

### Issue: Checkout session expires before payment
**Cause**: Default session expiration is 24 hours

**Solution**:
Add `expires_at` to checkout session creation:
```typescript
const session = await stripe.checkout.sessions.create({
  // ... other options
  expires_at: Math.floor(Date.now() / 1000) + (30 * 60), // 30 minutes
});
```

### Issue: Duplicate credit transactions
**Cause**: Not checking for existing payment intent ID

**Solution**:
Add idempotency check in webhook handler:
```typescript
// Check if payment already processed
const existing = await db.query.creditTransactions.findFirst({
  where: eq(
    schema.creditTransactions.stripe_payment_intent_id,
    paymentIntentId
  ),
});

if (existing) {
  console.log('Payment already processed:', paymentIntentId);
  return NextResponse.json({ received: true, duplicate: true });
}
```

---

## Additional Resources

### Stripe Documentation
- [Checkout Sessions](https://docs.stripe.com/api/checkout/sessions)
- [Webhooks](https://docs.stripe.com/webhooks)
- [Testing](https://docs.stripe.com/testing)
- [API Versioning](https://docs.stripe.com/api/versioning)

### Internal Documentation
- [Credit System Overview](./docs/CREDITS.md) (create if needed)
- [Database Schema](./db/schema.ts)
- [API Documentation](./docs/API.md) (create if needed)

### Support
- Stripe Support: https://support.stripe.com
- Stripe Status: https://status.stripe.com

---

## Future Enhancements

### Phase 2 Features
1. **Credit Pack Discounts**
   - Seasonal promotions
   - First-time buyer discount
   - Volume discounts for enterprises

2. **Custom Credit Packs**
   - Allow admins to create custom pack sizes
   - Configurable pricing
   - A/B testing different price points

3. **Gifting Credits**
   - Transfer credits between organizations
   - Gift codes for marketing campaigns
   - Referral credit bonuses

4. **Credit Analytics**
   - Credit usage trends over time
   - Cost per AI operation breakdown
   - Predictive credit consumption alerts

5. **Payment Methods**
   - ACH transfers for large purchases
   - Invoice billing for enterprises
   - Crypto payments (via Stripe or Coinbase)

6. **Auto-Recharge**
   - Automatically purchase credits when balance falls below threshold
   - Set preferred credit pack for auto-recharge
   - Email notifications before auto-recharge

7. **Credit Expiration (Optional)**
   - Credits expire after 12 months
   - Expiration reminders
   - Option to purchase non-expiring credits at premium

---

## Success Metrics

### KPIs to Track
1. **Conversion Rate**: Billing page visits → Purchases
2. **Average Order Value**: Average credits purchased per transaction
3. **Pack Distribution**: % of Small vs Medium vs Large purchases
4. **Time to First Purchase**: Days from signup to first credit purchase
5. **Repeat Purchase Rate**: % of users making 2+ purchases
6. **Credit Utilization**: % of purchased credits actually used
7. **Checkout Abandonment**: % of started checkouts not completed
8. **Webhook Success Rate**: % of webhooks processed successfully

### Target Benchmarks
- Conversion Rate: >5%
- Average Order Value: $150+
- Medium Pack: >40% of purchases (if priced correctly)
- Time to First Purchase: <7 days
- Repeat Purchase Rate: >30%
- Webhook Success Rate: >99.9%

---

**Document Version**: 1.0  
**Last Updated**: 2025-10-06  
**Author**: Eliza Cloud Team  
**Status**: Ready for Implementation

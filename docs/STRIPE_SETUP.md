# Stripe Credit Packs Setup Guide

This guide will walk you through setting up Stripe for the credit packs billing system in Eliza Cloud.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Get API Keys](#get-api-keys)
3. [Create Products and Prices](#create-products-and-prices)
4. [Update Seed Script](#update-seed-script)
5. [Set Up Webhooks](#set-up-webhooks)
6. [Test the Integration](#test-the-integration)
7. [Go Live](#go-live)

---

## Prerequisites

- **Stripe account**: Sign up at [https://stripe.com](https://stripe.com)
- **Access to Stripe Dashboard**: [https://dashboard.stripe.com](https://dashboard.stripe.com)
- **Development environment**: Local or staging environment with database access

---

## Get API Keys

### Step 1: Navigate to API Keys Page

1. Go to [https://dashboard.stripe.com/apikeys](https://dashboard.stripe.com/apikeys)
2. You'll see two types of keys:
   - **Publishable key** (starts with `pk_test_` or `pk_live_`)
   - **Secret key** (starts with `sk_test_` or `sk_live_`)

### Step 2: Copy Keys to Environment File

Add these keys to your `.env.local` file:

```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_YOUR_SECRET_KEY_HERE
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_PUBLISHABLE_KEY_HERE
```

⚠️ **Important**: 
- Use **test mode** keys for development (`sk_test_...` and `pk_test_...`)
- Use **live mode** keys for production (`sk_live_...` and `pk_live_...`)
- Never commit these keys to version control

---

## Create Products and Prices

You need to create three credit pack products in Stripe. Follow these steps for each pack.

### Small Credit Pack

1. Go to [https://dashboard.stripe.com/products](https://dashboard.stripe.com/products)
2. Click **"Add product"**
3. Fill in the following details:

   | Field | Value |
   |-------|-------|
   | **Name** | Small Credit Pack |
   | **Description** | 50,000 credits for AI generations. Perfect for testing and small projects. |
   | **Pricing model** | One time |
   | **Price** | $49.99 USD |

4. Click **"Save product"**
5. **Copy the Price ID** (starts with `price_`) - you'll need this for the seed script
6. **Copy the Product ID** (starts with `prod_`) - you'll need this too

### Medium Credit Pack

Repeat the above steps with these values:

| Field | Value |
|-------|-------|
| **Name** | Medium Credit Pack |
| **Description** | 150,000 credits for AI generations. Best value for regular usage. |
| **Pricing model** | One time |
| **Price** | $129.99 USD |

### Large Credit Pack

Repeat the above steps with these values:

| Field | Value |
|-------|-------|
| **Name** | Large Credit Pack |
| **Description** | 500,000 credits for AI generations. Maximum savings for power users. |
| **Pricing model** | One time |
| **Price** | $399.99 USD |

---

## Update Seed Script

### Step 1: Edit the Seed Script

Open `scripts/seed-credit-packs.ts` and replace the placeholder IDs with your actual Stripe IDs:

```typescript
const creditPacks = [
  {
    name: "Small Pack",
    description: "Perfect for testing and small projects",
    credits: 50000,
    price_cents: 4999,
    stripe_price_id: "price_YOUR_SMALL_PACK_PRICE_ID", // Replace this
    stripe_product_id: "prod_YOUR_SMALL_PACK_PRODUCT_ID", // Replace this
    sort_order: 1,
  },
  {
    name: "Medium Pack",
    description: "Best value for regular usage",
    credits: 150000,
    price_cents: 12999,
    stripe_price_id: "price_YOUR_MEDIUM_PACK_PRICE_ID", // Replace this
    stripe_product_id: "prod_YOUR_MEDIUM_PACK_PRODUCT_ID", // Replace this
    sort_order: 2,
  },
  {
    name: "Large Pack",
    description: "Maximum savings for power users",
    credits: 500000,
    price_cents: 39999,
    stripe_price_id: "price_YOUR_LARGE_PACK_PRICE_ID", // Replace this
    stripe_product_id: "prod_YOUR_LARGE_PACK_PRODUCT_ID", // Replace this
    sort_order: 3,
  },
];
```

### Step 2: Run the Seed Script

```bash
npm run seed:credit-packs
```

You should see output like:
```
🌱 Seeding credit packs...
✓ Created: Small Pack (uuid-here)
✓ Created: Medium Pack (uuid-here)
✓ Created: Large Pack (uuid-here)
✅ Credit packs seeded successfully!
🎉 Done!
```

---

## Set Up Webhooks

Webhooks allow Stripe to notify your application when payments are completed.

### For Local Development

#### Step 1: Install Stripe CLI

**macOS:**
```bash
brew install stripe/stripe-cli/stripe
```

**Linux:**
```bash
# Download the latest Linux tar.gz file from:
# https://github.com/stripe/stripe-cli/releases/latest
```

**Windows:**
```bash
# Download the latest Windows .zip file from:
# https://github.com/stripe/stripe-cli/releases/latest
```

#### Step 2: Login to Stripe CLI

```bash
stripe login
```

This will open a browser window to authorize the CLI.

#### Step 3: Forward Webhooks to Local Server

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

You'll see output like:
```
> Ready! Your webhook signing secret is whsec_1234567890abcdef...
```

#### Step 4: Copy Webhook Secret

Copy the signing secret (starts with `whsec_`) and add it to `.env.local`:

```env
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET_HERE
```

#### Step 5: Restart Your Dev Server

```bash
npm run dev
```

### For Production

#### Step 1: Add Webhook Endpoint

1. Go to [https://dashboard.stripe.com/webhooks](https://dashboard.stripe.com/webhooks)
2. Click **"Add endpoint"**
3. Enter your production URL:
   ```
   https://yourdomain.com/api/stripe/webhook
   ```

#### Step 2: Select Events

Select the following events to listen for:

- ✅ `checkout.session.completed`
- ✅ `payment_intent.succeeded`
- ✅ `payment_intent.payment_failed`

#### Step 3: Add Endpoint

1. Click **"Add endpoint"**
2. Copy the **Signing secret** (starts with `whsec_`)
3. Add it to your production environment variables:
   ```env
   STRIPE_WEBHOOK_SECRET=whsec_YOUR_PRODUCTION_WEBHOOK_SECRET
   ```

---

## Test the Integration

### Step 1: Start Your Application

```bash
# Terminal 1: Dev server
npm run dev

# Terminal 2: Stripe webhook listener (for local dev)
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

### Step 2: Navigate to Billing Page

Open your browser and go to:
```
http://localhost:3000/dashboard/billing
```

### Step 3: Initiate a Test Purchase

1. Click **"Purchase Credits"** on any credit pack
2. You'll be redirected to Stripe Checkout

### Step 4: Complete Test Payment

Use Stripe test card details:

| Field | Value |
|-------|-------|
| **Card Number** | 4242 4242 4242 4242 |
| **Expiry Date** | Any future date (e.g., 12/34) |
| **CVC** | Any 3 digits (e.g., 123) |
| **ZIP Code** | Any 5 digits (e.g., 12345) |

### Step 5: Verify Success

After clicking "Pay":

1. You should be redirected to `/dashboard/billing/success`
2. Your credit balance should be updated
3. Check your Stripe CLI output for the webhook event:
   ```
   2024-01-15 10:30:00   --> checkout.session.completed [evt_123...]
   2024-01-15 10:30:01  <--  [200] POST http://localhost:3000/api/stripe/webhook
   ```

### Step 6: Verify Database

Check your database to confirm:

```sql
-- Check credit packs
SELECT * FROM credit_packs WHERE is_active = true;

-- Check credit transactions
SELECT * FROM credit_transactions 
WHERE type = 'purchase' 
ORDER BY created_at DESC 
LIMIT 1;

-- Check organization balance
SELECT name, credit_balance FROM organizations;
```

---

## Go Live

When you're ready to launch to production:

### Step 1: Switch to Live Mode in Stripe

1. Toggle from "Test mode" to "Live mode" in Stripe Dashboard (top right)
2. Get your **live mode** API keys from [https://dashboard.stripe.com/apikeys](https://dashboard.stripe.com/apikeys)

### Step 2: Create Live Products

Repeat the [Create Products and Prices](#create-products-and-prices) steps in **Live mode** with the same:
- Product names
- Descriptions
- Prices

### Step 3: Update Production Environment

Update your production environment variables with:

```env
# Live mode keys
STRIPE_SECRET_KEY=sk_live_YOUR_LIVE_SECRET_KEY
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_YOUR_LIVE_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET=whsec_YOUR_PRODUCTION_WEBHOOK_SECRET
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

### Step 4: Update and Run Seed Script in Production

1. Update `scripts/seed-credit-packs.ts` with **live mode** Price IDs and Product IDs
2. Run the seed script on your production database:
   ```bash
   npm run seed:credit-packs
   ```

### Step 5: Set Up Production Webhook

Follow the [Production Webhook Setup](#for-production) steps to create a webhook endpoint pointing to your production URL.

### Step 6: Test in Production

1. Navigate to your production billing page
2. Make a small real purchase to test the flow
3. Verify credits are added correctly
4. Monitor webhook delivery in Stripe Dashboard

---

## Testing Different Scenarios

### Test Cards for Different Outcomes

| Scenario | Card Number | Expected Result |
|----------|-------------|-----------------|
| **Successful Payment** | 4242 4242 4242 4242 | Payment succeeds, credits added |
| **Declined Payment** | 4000 0000 0000 0002 | Payment declined, no credits added |
| **Requires Authentication** | 4000 0025 0000 3155 | 3D Secure authentication required |
| **Insufficient Funds** | 4000 0000 0000 9995 | Insufficient funds error |
| **Processing Error** | 4000 0000 0000 0127 | Processing error |

### Monitor Webhook Events

In Stripe Dashboard:
1. Go to **Developers** → **Webhooks**
2. Click on your webhook endpoint
3. View the **Logs** tab to see all webhook events and their responses

---

## Troubleshooting

### Issue: "Webhook signature verification failed"

**Cause**: Mismatch between `STRIPE_WEBHOOK_SECRET` in your code and the actual webhook secret.

**Solution**:
1. For local dev, check the Stripe CLI output and copy the exact `whsec_` value
2. For production, check your webhook endpoint in Stripe Dashboard and copy the signing secret
3. Restart your server after updating `.env.local`

### Issue: "Credits not added after successful payment"

**Cause**: Webhook not reaching your server or processing error.

**Solution**:
1. Check Stripe CLI output for incoming webhook events (local dev)
2. Check Stripe Dashboard → Webhooks → Event logs for webhook delivery status
3. Check your server logs for errors in the webhook handler
4. Verify your webhook endpoint is publicly accessible (production)
5. Manually retry the event from Stripe Dashboard

### Issue: "Stripe failed to load"

**Cause**: Invalid or missing `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.

**Solution**:
1. Verify the key is set in `.env.local`
2. Ensure the key starts with `pk_test_` (test mode) or `pk_live_` (live mode)
3. Restart your dev server
4. Check browser console for Stripe.js loading errors

### Issue: "Duplicate credit transactions"

**Cause**: Webhook event processed multiple times.

**Solution**:
The webhook handler should be idempotent. Check if there's already a transaction with the same `stripe_payment_intent_id` before adding credits.

---

## Additional Resources

### Stripe Documentation
- [Checkout Sessions](https://docs.stripe.com/api/checkout/sessions)
- [Webhooks Guide](https://docs.stripe.com/webhooks)
- [Testing Guide](https://docs.stripe.com/testing)
- [API Versioning](https://docs.stripe.com/api/versioning)

### Stripe Tools
- [Stripe Dashboard](https://dashboard.stripe.com)
- [Stripe CLI Documentation](https://docs.stripe.com/stripe-cli)
- [Stripe Status Page](https://status.stripe.com)

### Support
- Stripe Support: [https://support.stripe.com](https://support.stripe.com)
- Stripe Community: [https://github.com/stripe](https://github.com/stripe)

---

## Security Best Practices

1. ✅ Always verify webhook signatures
2. ✅ Never expose secret keys in client-side code
3. ✅ Use environment variables for all sensitive data
4. ✅ Implement rate limiting on checkout session creation
5. ✅ Log all webhook events for audit trail
6. ✅ Monitor for unusual activity in Stripe Dashboard
7. ✅ Use HTTPS in production
8. ✅ Keep Stripe SDK updated

---

**Last Updated**: 2024-10-06  
**Version**: 1.0  
**Maintainer**: Eliza Cloud Team

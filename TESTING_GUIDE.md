# 🧪 Testing Guide - Stripe Credit Packs

This guide will help you test the Stripe Credit Packs implementation using **test mode only** (no real charges).

---

## 🚀 Quick Test (5 Minutes)

### Prerequisites
- [ ] Node.js installed
- [ ] npm packages installed (`npm install`)
- [ ] Stripe test account created (free at [stripe.com](https://stripe.com))

### Get Stripe Test Keys

1. Go to https://dashboard.stripe.com/test/apikeys
2. Toggle to **TEST MODE** (top right)
3. Copy these keys:
   - **Publishable key**: `pk_test_...`
   - **Secret key**: `sk_test_...`

### Set Up Environment

Create or update `.env.local`:

```bash
# Stripe Test Keys (NO REAL CHARGES)
STRIPE_SECRET_KEY=sk_test_YOUR_KEY_HERE
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_KEY_HERE
STRIPE_WEBHOOK_SECRET=whsec_test_will_set_later
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Your existing database URL
DATABASE_URL=your_database_url_here
```

---

## 📋 Step-by-Step Testing

### Step 1: Create Test Stripe Products (Automated)

Run our setup script to create test products via Stripe API:

```bash
npx tsx scripts/test-stripe-setup.ts
```

This will:
- ✅ Create 3 test products in Stripe (Small, Medium, Large)
- ✅ Generate a seed script with real Stripe IDs
- ✅ Test your API endpoints

**Expected Output:**
```
🧪 Stripe Credit Packs Test Setup
==================================================

📦 Step 1: Creating Stripe Products
--------------------------------------------------
🔨 Creating: Small Credit Pack...
  ✓ Product created: prod_xxx
  ✓ Price created: price_xxx ($49.99)

✅ Successfully created all Stripe products!
```

### Step 2: Apply Database Schema

Push schema changes to database:

```bash
npm run db:push
```

**Expected Output:**
```
[✓] Changes applied
```

### Step 3: Seed Credit Packs

Run the generated seed script:

```bash
npx tsx scripts/seed-credit-packs-generated.ts
```

**Expected Output:**
```
🌱 Seeding credit packs...
✓ Created: Small Pack (uuid-here)
✓ Created: Medium Pack (uuid-here)
✓ Created: Large Pack (uuid-here)
✅ Credit packs seeded successfully!
```

### Step 4: Start Development Server

```bash
npm run dev
```

Server should start on http://localhost:3000

### Step 5: Test API Endpoints

In a new terminal, run our test script:

```bash
./scripts/test-api-endpoints.sh
```

Or manually test with curl:

```bash
# Test 1: List credit packs
curl http://localhost:3000/api/stripe/credit-packs

# Expected response:
# {
#   "creditPacks": [
#     {
#       "id": "uuid",
#       "name": "Small Pack",
#       "credits": 50000,
#       "price_cents": 4999,
#       ...
#     }
#   ]
# }
```

### Step 6: Test Browser Flow

1. **Navigate to billing page:**
   ```
   http://localhost:3000/dashboard/billing
   ```

2. **You should see:**
   - Current credit balance card
   - 3 credit pack cards (Small, Medium, Large)
   - "Popular" badge on Medium pack
   - Purchase buttons

3. **Click "Purchase Credits"** on any pack
   - You'll be redirected to Stripe Checkout
   - This is the real Stripe checkout page (test mode)

4. **Complete test purchase:**
   - Use test card: `4242 4242 4242 4242`
   - Expiry: Any future date (e.g., `12/34`)
   - CVC: Any 3 digits (e.g., `123`)
   - ZIP: Any 5 digits (e.g., `12345`)

5. **After payment:**
   - Redirected to `/dashboard/billing/success`
   - See your updated credit balance

---

## 🔌 Webhook Testing

Webhooks are how Stripe notifies your app when payments complete.

### Option 1: Stripe CLI (Recommended)

1. **Install Stripe CLI:**
   ```bash
   # macOS
   brew install stripe/stripe-cli/stripe
   
   # Or download from:
   # https://github.com/stripe/stripe-cli/releases
   ```

2. **Login:**
   ```bash
   stripe login
   ```

3. **Forward webhooks to your local server:**
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```

4. **Copy the webhook signing secret:**
   ```
   > Ready! Your webhook signing secret is whsec_xxx
   ```

5. **Update `.env.local`:**
   ```bash
   STRIPE_WEBHOOK_SECRET=whsec_xxx
   ```

6. **Restart your dev server**

7. **Test webhook:**
   ```bash
   # In another terminal
   stripe trigger checkout.session.completed
   ```

   You should see in Stripe CLI output:
   ```
   --> checkout.session.completed [evt_xxx]
   <-- [200] POST http://localhost:3000/api/stripe/webhook
   ```

### Option 2: Manual Webhook Testing

If you don't want to use Stripe CLI, you can test webhooks by:

1. Completing an actual test checkout (as described above)
2. Checking your server logs for webhook processing
3. Verifying credits were added to your account

---

## 🧪 Test Scenarios

### ✅ Successful Purchase Test

```bash
# 1. Note current credit balance
curl http://localhost:3000/api/stripe/credit-packs | jq '.creditPacks[0].credits'

# 2. Complete purchase in browser with test card 4242 4242 4242 4242

# 3. Verify webhook received (check Stripe CLI output)

# 4. Verify credits added (check database or dashboard)
```

### ❌ Declined Card Test

Test card for declined payments:
```
Card: 4000 0000 0000 0002
```

Expected behavior:
- Payment should be declined
- No credits should be added
- User remains on Stripe checkout with error message

### 🔄 Canceled Checkout Test

1. Click "Purchase Credits"
2. On Stripe checkout page, click the back arrow
3. You should be redirected to `/dashboard/billing?canceled=true`
4. See "Payment Canceled" alert

### 🔐 Authentication Test

Test that endpoints require authentication:

```bash
# Should fail without auth
curl -X POST http://localhost:3000/api/stripe/create-checkout-session \
  -H "Content-Type: application/json" \
  -d '{"creditPackId": "test-id"}'

# Expected: 401 Unauthorized or similar
```

---

## 📊 Verification Checklist

After testing, verify:

- [ ] All 3 credit packs appear on billing page
- [ ] "Popular" badge shows on Medium pack
- [ ] Current balance displays correctly
- [ ] Clicking "Purchase" redirects to Stripe
- [ ] Test purchase completes successfully
- [ ] Credits are added after payment
- [ ] Webhook events are logged
- [ ] Transaction appears in database
- [ ] Success page shows updated balance
- [ ] Navigation works (back to billing, to dashboard)

---

## 🔍 Database Verification

Check your database directly:

```sql
-- View credit packs
SELECT * FROM credit_packs WHERE is_active = true;

-- View recent credit transactions
SELECT * FROM credit_transactions 
ORDER BY created_at DESC 
LIMIT 5;

-- View organization balances
SELECT id, name, credit_balance FROM organizations;
```

---

## 🐛 Troubleshooting

### Issue: "Credit packs not found"

**Solution:**
```bash
# Run the seed script
npx tsx scripts/seed-credit-packs-generated.ts
```

### Issue: "Webhook signature verification failed"

**Solution:**
1. Check `STRIPE_WEBHOOK_SECRET` in `.env.local` matches Stripe CLI output
2. Restart dev server after updating `.env.local`
3. Make sure you're using the webhook secret from `stripe listen`, not dashboard

### Issue: "Stripe failed to load"

**Solution:**
1. Verify `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` starts with `pk_test_`
2. Check browser console for errors
3. Restart dev server

### Issue: "Credits not added after payment"

**Solution:**
1. Check Stripe CLI is running and showing webhook events
2. Check your server logs for errors in webhook handler
3. Verify webhook secret is correct
4. Check database for credit_transactions record

### Issue: "Database connection error"

**Solution:**
1. Verify `DATABASE_URL` in `.env.local` is correct
2. Check database is running
3. Run migrations: `npm run db:push`

---

## 📈 Test Results to Expect

### Successful Setup:

```
✅ API Endpoint: GET /api/stripe/credit-packs returns 200
✅ 3 credit packs in response
✅ Billing page loads successfully
✅ Checkout session created (redirects to Stripe)
✅ Test payment completes
✅ Webhook received and processed
✅ Credits added to organization
✅ Transaction recorded in database
✅ Success page displays correctly
```

### Failed Setup:

```
❌ API returns 500 error
❌ No credit packs in database
❌ Checkout session creation fails
❌ Webhook not received
❌ Credits not added
```

If you see failures, check:
1. Environment variables are set correctly
2. Database migration applied
3. Seed script ran successfully
4. Dev server is running
5. Stripe CLI is forwarding webhooks

---

## 🎯 Manual Testing Checklist

### Before Testing
- [ ] `.env.local` configured with test keys
- [ ] Database migration applied
- [ ] Credit packs seeded
- [ ] Dev server running
- [ ] Stripe CLI running (for webhooks)

### Browser Testing
- [ ] Visit `/dashboard/billing`
- [ ] See 3 credit packs with correct pricing
- [ ] Current balance displays
- [ ] Click "Purchase Credits" on Small pack
- [ ] Redirected to Stripe checkout
- [ ] Enter test card: 4242 4242 4242 4242
- [ ] Complete payment
- [ ] Redirected to success page
- [ ] Balance updated correctly
- [ ] Navigate back to billing page
- [ ] Navigate to dashboard

### API Testing
- [ ] GET `/api/stripe/credit-packs` returns 200
- [ ] Response includes all 3 packs
- [ ] POST `/api/stripe/create-checkout-session` requires auth
- [ ] POST `/api/stripe/webhook` validates signatures

### Database Testing
- [ ] credit_packs table has 3 records
- [ ] credit_transactions table has purchase record
- [ ] organizations table has updated balance
- [ ] stripe_payment_intent_id is recorded

---

## 🚀 Going to Production

When ready for production:

1. **Switch to live mode:**
   - Get live API keys: https://dashboard.stripe.com/apikeys
   - Update `.env.local` with `sk_live_...` and `pk_live_...`

2. **Create live products:**
   - Run setup script again (it will create live products)
   - Or create manually in Stripe Dashboard (live mode)

3. **Set up production webhook:**
   - Go to https://dashboard.stripe.com/webhooks
   - Add endpoint: `https://yourdomain.com/api/stripe/webhook`
   - Select events: `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`
   - Copy signing secret to production env

4. **Deploy and test:**
   - Deploy your app
   - Test with real card (small amount)
   - Verify credits are added
   - Monitor webhook events in Stripe Dashboard

---

## 📚 Additional Resources

- **Stripe Test Cards**: https://docs.stripe.com/testing
- **Stripe CLI Docs**: https://docs.stripe.com/stripe-cli
- **Webhook Testing**: https://docs.stripe.com/webhooks/test
- **API Reference**: https://docs.stripe.com/api

---

## 💡 Pro Tips

1. **Always use test mode** during development (keys start with `sk_test_`)
2. **Keep Stripe CLI running** to see webhook events in real-time
3. **Check Stripe Dashboard** (test mode) to see all test payments and products
4. **Use test cards** from Stripe docs to test different scenarios
5. **Monitor server logs** for detailed error messages
6. **Check browser console** for client-side errors

---

**Happy Testing!** 🎉

If you encounter issues not covered here, check:
- `docs/STRIPE_SETUP.md` - Detailed setup guide
- `IMPLEMENTATION_COMPLETE.md` - Complete implementation summary
- Stripe Dashboard - Event logs and webhook delivery status

# 🚀 Stripe Credit Packs - Quick Start Guide

## ⚡ Implementation Status: COMPLETE ✅

All code has been implemented. You just need to configure Stripe and run the migration!

---

## 📋 Prerequisites Checklist

- [ ] Stripe account created at [stripe.com](https://stripe.com)
- [ ] Database backup completed
- [ ] `.env.local` file ready

---

## 🎯 3-Step Setup

### Step 1: Configure Environment Variables (5 minutes)

Add to your `.env.local`:

```env
# Stripe Keys (get from https://dashboard.stripe.com/apikeys)
STRIPE_SECRET_KEY=sk_test_YOUR_SECRET_KEY
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Step 2: Create Stripe Products (10 minutes)

Go to [dashboard.stripe.com/products](https://dashboard.stripe.com/products) and create:

| Product | Price | Credits |
|---------|-------|---------|
| Small Credit Pack | $49.99 | 50,000 |
| Medium Credit Pack | $129.99 | 150,000 |
| Large Credit Pack | $399.99 | 500,000 |

**Important**: Copy the `price_xxx` and `prod_xxx` IDs for each pack!

### Step 3: Run Setup Commands (5 minutes)

```bash
# 1. Install dependencies
npm install

# 2. Generate database migration
npm run db:generate

# 3. Apply migration to database
npm run db:migrate

# 4. Update scripts/seed-credit-packs.ts with your Stripe IDs
# Then seed the database:
npm run seed:credit-packs

# 5. Start development server
npm run dev

# 6. In another terminal, start Stripe webhooks
stripe login
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

---

## 🧪 Test It!

1. Open http://localhost:3000/dashboard/billing
2. Click "Purchase Credits" on any pack
3. Use test card: `4242 4242 4242 4242`
4. Complete the checkout
5. Verify credits are added! 🎉

---

## 📚 Full Documentation

- **Complete Implementation Plan**: `STRIPE_CREDIT_PACKS_IMPLEMENTATION.md`
- **Detailed Stripe Setup**: `docs/STRIPE_SETUP.md`
- **Implementation Summary**: `IMPLEMENTATION_COMPLETE.md`

---

## 🐛 Quick Troubleshooting

**Problem**: "Webhook signature verification failed"  
→ Copy the `whsec_` value from Stripe CLI output to `.env.local`

**Problem**: "Credits not added after payment"  
→ Check Stripe CLI is running and webhook events are being received

**Problem**: Migration fails  
→ Make sure database is accessible and backup exists

---

## 📞 Need Help?

- Stripe Setup Guide: `docs/STRIPE_SETUP.md` (comprehensive)
- Implementation Details: `IMPLEMENTATION_COMPLETE.md`
- Stripe Docs: https://docs.stripe.com

---

**Total Setup Time**: ~20 minutes  
**Status**: Ready to Deploy! 🚀

# Environment Configuration Setup Guide

This guide helps you set up all required and optional environment variables for ElizaOS Cloud V2.

## Quick Start

1. Copy the example file:

```bash
cp example.env.local .env.local
```

2. Fill in required variables (marked as REQUIRED)
3. Optionally configure features you want to use
4. Restart dev server: `npm run dev`

## Variable Consolidation

### Cloudflare Account ID

**Important**: `CLOUDFLARE_ACCOUNT_ID` and `R2_ACCOUNT_ID` are the **same value**.

To get your Cloudflare Account ID:

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Go to any page (e.g., Workers & Pages)
3. Look at the URL: `dash.cloudflare.com/{account-id}/...`
4. Copy the 32-character hex string

Set both variables to this value:

```env
CLOUDFLARE_ACCOUNT_ID=abc123def456...
R2_ACCOUNT_ID=abc123def456...  # Same value!
```

**Note**: In the future, we'll remove `R2_ACCOUNT_ID` and only use `CLOUDFLARE_ACCOUNT_ID`.

### Cloudflare API Authentication

You have two options for Cloudflare API authentication:

**Option 1: API Token (Recommended)**

```env
CLOUDFLARE_API_TOKEN=your_scoped_api_token
```

Generate a token with these permissions:

- Account > Account Settings > Read
- Account > Workers Scripts > Edit
- Account > Workers Routes > Edit
- Account > R2 > Edit

**Option 2: Global API Key (Legacy, Not Recommended)**

```env
CLOUDFLARE_EMAIL=your@email.com
CLOUDFLARE_API_KEY=your_global_api_key
```

**Use Option 1 (API Token) for better security.** The legacy email + key authentication is deprecated.

## Required Variables

### Database

```env
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require
```

Get from: [Neon](https://neon.tech), [Supabase](https://supabase.com), or any Postgres provider

### Authentication (Privy)

```env
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id_here
PRIVY_APP_SECRET=your_privy_app_secret_here
PRIVY_WEBHOOK_SECRET=<generate-random-32+-chars>
```

Setup:

1. Create account at [Privy](https://privy.io)
2. Create an application
3. Configure login methods (email, wallet, social)
4. Set up webhook endpoint: `https://your-domain.com/api/privy/webhook`
5. Generate a random 32+ character string for webhook secret:
   ```bash
   openssl rand -base64 32
   ```

## Optional Features

### AI Services (Enable at least one)

**OpenAI:**

```env
OPENAI_API_KEY=sk-proj-...
```

Get from: [OpenAI Platform](https://platform.openai.com/api-keys)

**AI Gateway:**

```env
AI_GATEWAY_API_KEY=your_gateway_key
```

Get from: Your AI Gateway provider

### Vercel Blob (for Gallery/Media)

```env
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
```

Setup:

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Navigate to Storage → Create → Blob
3. Copy the `BLOB_READ_WRITE_TOKEN`

### Cloudflare (for 'elizaos deploy')

Required for container deployments via CLI:

```env
# Account & Authentication
CLOUDFLARE_ACCOUNT_ID=abc123def456...
CLOUDFLARE_API_TOKEN=your_scoped_token

# R2 Storage Access
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=eliza-artifacts
R2_ENDPOINT=https://{account-id}.r2.cloudflarestorage.com
```

Setup:

1. **Create R2 Bucket**:
   - Go to Cloudflare Dashboard → R2
   - Click "Create bucket"
   - Name it `eliza-artifacts`
   - Select region closest to your users

2. **Generate R2 API Token**:
   - In R2 section, click "Manage R2 API Tokens"
   - Click "Create API token"
   - Permissions: Object Read & Write
   - Copy `Access Key ID` and `Secret Access Key`

3. **Set Endpoint**:
   - Format: `https://{account-id}.r2.cloudflarestorage.com`
   - Replace `{account-id}` with your Cloudflare account ID

### Stripe (for Payments)

```env
STRIPE_SECRET_KEY=sk_test_... # or sk_live_... for production
STRIPE_WEBHOOK_SECRET=whsec_...
```

Setup:

1. Create account at [Stripe](https://stripe.com)
2. Get API keys from Dashboard → Developers → API keys
3. Set up webhook:
   - Dashboard → Developers → Webhooks
   - Add endpoint: `https://your-domain.com/api/stripe/webhook`
   - Select events: `payment_intent.succeeded`, `payment_intent.payment_failed`
   - Copy webhook secret

### Cron Jobs

```env
CRON_SECRET=random_secret_for_securing_cron_endpoints
```

Generate:

```bash
openssl rand -hex 32
```

## Validation

Run validation to check configuration:

```bash
npm run dev
```

On startup, the app will:

- ✅ Validate all required variables
- ⚠️ Warn about missing optional variables
- 📋 Show which features are enabled/disabled

## Feature Status

After configuration, check which features are available:

Visit: `http://localhost:3000/dashboard`

The dashboard will show:

- ✅ Enabled - Feature is fully configured
- ⚠️ Disabled - Missing required environment variables

## Environment-Specific Configuration

### Development (.env.local)

```env
DATABASE_URL=postgresql://localhost:5432/eliza_dev
# Privy handles authentication via client-side SDK
# Use test/development keys
STRIPE_SECRET_KEY=sk_test_...
```

### Production (.env.production or Vercel Environment Variables)

```env
DATABASE_URL=postgresql://production-host:5432/eliza_prod?sslmode=require
# Configure Privy webhook in dashboard: https://your-domain.com/api/privy/webhook
# Use live keys
STRIPE_SECRET_KEY=sk_live_...
```

## Security Best Practices

1. **Never commit `.env.local`** - It's in `.gitignore` by default
2. **Use different keys for dev/prod** - Don't use production keys in development
3. **Rotate secrets regularly** - Especially API keys and tokens
4. **Use scoped tokens** - Give minimum required permissions
5. **Enable 2FA** - On all service accounts (Cloudflare, Privy, etc.)
6. **Monitor usage** - Set up alerts for unusual activity

## Troubleshooting

### "Environment validation failed"

Check that:

- All REQUIRED variables are set
- Values match expected formats (e.g., `sk_` prefix for API keys)
- DATABASE_URL starts with `postgresql://`
- PRIVY_WEBHOOK_SECRET is at least 32 characters
- URLs start with `http://` or `https://`

### "Feature not configured"

If you see "Container deployments are not configured":

- Verify ALL Cloudflare variables are set
- Verify ALL R2 variables are set
- Both are required for the feature to work

### "Cannot connect to database"

- Verify DATABASE_URL is correct
- Check database is running and accessible
- Ensure `?sslmode=require` is appended for remote databases
- Test connection: `psql $DATABASE_URL`

## Example: Minimal Configuration

For development/testing with minimal features:

```env
# Required
DATABASE_URL=postgresql://localhost:5432/eliza_dev
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id_here
PRIVY_APP_SECRET=your_privy_app_secret_here
PRIVY_WEBHOOK_SECRET=abcdefghijklmnopqrstuvwxyz123456

# Optional - Just OpenAI for AI features
OPENAI_API_KEY=sk-proj-...
```

This gives you:

- ✅ Authentication
- ✅ Database
- ✅ AI Chat/Generation
- ⚠️ No container deployments
- ⚠️ No media gallery
- ⚠️ No payments

## Example: Full Production Configuration

For production with all features:

```env
# Database
DATABASE_URL=postgresql://prod-user:***@prod-host:5432/eliza?sslmode=require

# Auth
WORKOS_CLIENT_ID=client_01H...
WORKOS_API_KEY=sk_live_...
WORKOS_COOKIE_PASSWORD=***
PRIVY_WEBHOOK_SECRET=https://eliza.cloud/api/auth/callback

# AI
OPENAI_API_KEY=sk-proj-...
AI_GATEWAY_API_KEY=***

# Storage
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...

# Cloudflare (consolidated)
CLOUDFLARE_ACCOUNT_ID=abc123def456...
CLOUDFLARE_API_TOKEN=***
R2_ACCESS_KEY_ID=***
R2_SECRET_ACCESS_KEY=***
R2_BUCKET_NAME=eliza-artifacts-prod
R2_ENDPOINT=https://abc123def456.r2.cloudflarestorage.com

# Payments
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Security
CRON_SECRET=***
```

This enables all features.

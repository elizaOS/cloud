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

### AWS ECS/ECR (for 'elizaos deploy')

Required for container deployments via CLI. The platform uses CloudFormation to provision per-user infrastructure automatically.

```env
# AWS Credentials
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...

# Network Configuration
AWS_VPC_ID=vpc-...
AWS_SUBNET_IDS=subnet-xxx,subnet-yyy
AWS_SECURITY_GROUP_IDS=sg-...

# ECS Configuration
ECS_CLUSTER_NAME=elizaos-production

# ECS IAM Roles
ECS_EXECUTION_ROLE_ARN=arn:aws:iam::...:role/ecsTaskExecutionRole
ECS_TASK_ROLE_ARN=arn:aws:iam::...:role/ecsTaskRole

# Optional: Shared ALB for cost optimization (recommended)
ECS_SHARED_ALB_ARN=arn:aws:elasticloadbalancing:...
ECS_SHARED_LISTENER_ARN=arn:aws:elasticloadbalancing:...

# Environment (for stack naming)
ENVIRONMENT=production
```

Setup:

1. **Deploy Shared Infrastructure**:
   ```bash
   cd infrastructure/cloudformation
   ./deploy-shared.sh
   ```
   This creates:
   - VPC with public subnets
   - Application Load Balancer (ALB)
   - IAM roles for ECS tasks
   - Security groups

2. **Get CloudFormation Outputs**:
   - VPC ID, Subnet IDs, Security Group IDs
   - IAM Role ARNs
   - ALB and Listener ARNs

3. **Configure Environment Variables**:
   - Add the CloudFormation outputs to your `.env.local`
   - Platform will create per-user CloudFormation stacks automatically

4. **Deploy**:
   - Users can now use `elizaos deploy` to deploy containers
   - Each user gets a dedicated t3g.small EC2 instance

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

### Production (Vercel Environment Variables)

```env
# Databases
DATABASE_URL=postgresql://production-host:5432/eliza_platform?sslmode=require
AGENT_DATABASE_URL=postgresql://production-host:5432/eliza_agents?sslmode=require

# Privy Authentication
NEXT_PUBLIC_PRIVY_APP_ID=your_production_app_id
PRIVY_APP_SECRET=your_production_secret
PRIVY_WEBHOOK_SECRET=your_webhook_secret
# Configure webhook in Privy dashboard: https://your-domain.com/api/privy/webhook

# Stripe (Live Keys)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# AWS (for container deployments)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
ECS_CLUSTER_NAME=elizaos-production
AWS_VPC_ID=vpc-...
AWS_SUBNET_IDS=subnet-xxx,subnet-yyy
AWS_SECURITY_GROUP_IDS=sg-...

# Cron Security
CRON_SECRET=your_production_cron_secret
```

## Security Best Practices

1. **Never commit `.env.local`** - It's in `.gitignore` by default
2. **Use different keys for dev/prod** - Don't use production keys in development
3. **Rotate secrets regularly** - Especially API keys and tokens
4. **Use scoped tokens** - Give minimum required permissions
5. **Enable 2FA** - On all service accounts (AWS, Privy, Stripe, etc.)
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

- Verify ALL AWS ECS variables are set (AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, ECS_CLUSTER_NAME, AWS_VPC_ID)
- Check AWS credentials are valid: `aws sts get-caller-identity`
- Verify shared infrastructure is deployed: `aws cloudformation describe-stacks --stack-name elizaos-shared-production`
- Check CloudFormation deployment guide: `infrastructure/README.md`

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
# Databases
DATABASE_URL=postgresql://prod-user:***@prod-host:5432/eliza_platform?sslmode=require
AGENT_DATABASE_URL=postgresql://prod-user:***@prod-host:5432/eliza_agents?sslmode=require

# Privy Authentication
NEXT_PUBLIC_PRIVY_APP_ID=your_production_app_id
PRIVY_APP_SECRET=***
PRIVY_WEBHOOK_SECRET=***

# AI Services
OPENAI_API_KEY=sk-proj-...
AI_GATEWAY_API_KEY=***
FAL_KEY=***

# Storage
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...

# AWS ECS/ECR Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=***
AWS_SECRET_ACCESS_KEY=***
ECS_CLUSTER_NAME=elizaos-production
AWS_VPC_ID=vpc-***
AWS_SUBNET_IDS=subnet-***,subnet-***
AWS_SECURITY_GROUP_IDS=sg-***
ECS_EXECUTION_ROLE_ARN=arn:aws:iam::***:role/ecsTaskExecutionRole
ECS_TASK_ROLE_ARN=arn:aws:iam::***:role/ecsTaskRole
ECS_SHARED_ALB_ARN=arn:aws:elasticloadbalancing:***
ECS_SHARED_LISTENER_ARN=arn:aws:elasticloadbalancing:***
ENVIRONMENT=production

# Payments
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# Security
CRON_SECRET=***
```

This enables all features: authentication, AI generation, container deployments, media gallery, and payments.

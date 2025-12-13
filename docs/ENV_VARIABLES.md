# Environment Variables Documentation

Complete guide to environment variables for ElizaOS Cloud with AWS ECS deployment.

## Required Platform Environment Variables

### Database

#### Platform Database

- `DATABASE_URL` - PostgreSQL connection string for platform tables
  - Contains: organizations, users, API keys, credits, containers, usage records, etc.
  - Example: `postgresql://user:pass@host:5432/eliza_platform?sslmode=require`

**Configuration Options:**

1. **Development**: Single PostgreSQL database

   ```env
   DATABASE_URL=postgresql://localhost:5432/eliza_dev
   ```

2. **Production**: PostgreSQL with connection pooling
   ```env
   DATABASE_URL=postgresql://user:pass@host:5432/eliza_platform?sslmode=require&pool_timeout=0
   ```

### Authentication (WorkOS)

- `WORKOS_CLIENT_ID` - WorkOS client ID
- `WORKOS_API_KEY` - WorkOS API key
- `WORKOS_REDIRECT_URI` - OAuth redirect URI
- `WORKOS_COOKIE_PASSWORD` - Cookie encryption password (32+ characters, generate with `openssl rand -base64 32`)

### AWS Configuration

#### AWS Credentials

- `AWS_REGION` - AWS region (e.g., `us-east-1`)
- `AWS_ACCESS_KEY_ID` - AWS access key ID
- `AWS_SECRET_ACCESS_KEY` - AWS secret access key

#### ECR (Elastic Container Registry)

No additional configuration required - uses AWS credentials above.

#### ECS (Elastic Container Service)

- `ECS_CLUSTER_NAME` - ECS cluster name (e.g., `elizaos-cluster`)
- `ECS_EXECUTION_ROLE_ARN` - ECS task execution role ARN
  - Format: `arn:aws:iam::123456789012:role/ecsTaskExecutionRole`
  - Required permissions: ECR pull, CloudWatch logs
- `ECS_TASK_ROLE_ARN` - ECS task role ARN (optional, for app permissions)
  - Format: `arn:aws:iam::123456789012:role/ecsTaskRole`

#### Networking

- `AWS_VPC_ID` - VPC ID for ECS tasks (e.g., `vpc-0123456789abcdef0`)
- `AWS_SUBNET_IDS` - Comma-separated subnet IDs (e.g., `subnet-abc123,subnet-def456`)
- `AWS_SECURITY_GROUP_IDS` - Comma-separated security group IDs (e.g., `sg-abc123,sg-def456`)

**Security Group Requirements:**

- Inbound: Port 80 (HTTP) from 0.0.0.0/0
- Inbound: Container port from ALB security group
- Outbound: All traffic (for pulling images and external API calls)

### Stripe (for billing)

- `STRIPE_SECRET_KEY` - Stripe secret key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook secret
- `STRIPE_PUBLISHABLE_KEY` - Stripe publishable key
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Public Stripe key for frontend

### Application

- `NEXT_PUBLIC_APP_URL` - Public URL of the application (e.g., `https://elizacloud.ai`)
- `NEXTAUTH_URL` - NextAuth URL (same as NEXT_PUBLIC_APP_URL)
- `NEXTAUTH_SECRET` - NextAuth secret (generate with `openssl rand -base64 32`)

## Optional Environment Variables

### AI Services

- `FAL_KEY` - Fal.ai API key for image/video generation
- `OPENAI_API_KEY` - OpenAI API key for chat features

### Rate Limiting

- `RATE_LIMIT_REQUESTS` - Max requests per window (default: 60)
- `RATE_LIMIT_WINDOW_MS` - Time window in ms (default: 60000)

### Monitoring

- `SENTRY_DSN` - Sentry DSN for error tracking (optional)
- `LOG_LEVEL` - Logging level: debug, info, warn, error (default: info)

## CLI Environment Variables

For the ElizaOS CLI (`elizaos deploy`):

- `ELIZAOS_API_KEY` or `ELIZA_CLOUD_API_KEY` - Your ElizaOS Cloud API key
- `ELIZAOS_API_URL` or `ELIZA_CLOUD_API_URL` - ElizaOS Cloud API URL (default: https://elizacloud.ai)

Get your API key from: https://elizacloud.ai/dashboard/api-keys

## Container Runtime Environment Variables

These are configured in your deployment and passed to ECS tasks:

### Automatically Set

- `PORT` - Port the application listens on (from container config, default: 3000)
- `NODE_ENV` - Node environment (set to "production")
- `AWS_REGION` - AWS region (inherited from task definition)

### User-Defined

You can pass any environment variables during deployment:

```bash
elizaos deploy \
  --env OPENAI_API_KEY="sk-..." \
  --env DATABASE_URL="postgresql://..." \
  --env CUSTOM_VAR="value"
```

Or via API:

```json
{
  "environment_vars": {
    "OPENAI_API_KEY": "sk-...",
    "DATABASE_URL": "postgresql://...",
    "CUSTOM_VAR": "value"
  }
}
```

**Security Note**: All environment variables are encrypted at rest in the database and securely passed to ECS tasks.

## Example .env.local File

```env
# Database
DATABASE_URL=postgresql://localhost:5432/eliza_dev

# WorkOS Auth
WORKOS_CLIENT_ID=client_xxxxx
WORKOS_API_KEY=sk_live_xxxxx
WORKOS_REDIRECT_URI=http://localhost:3000/callback
WORKOS_COOKIE_PASSWORD=your-32-char-cookie-password-here

# Stripe
STRIPE_SECRET_KEY=sk_test_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx

# AWS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXX
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ECS
ECS_CLUSTER_NAME=elizaos-cluster
ECS_EXECUTION_ROLE_ARN=arn:aws:iam::123456789012:role/ecsTaskExecutionRole
ECS_TASK_ROLE_ARN=arn:aws:iam::123456789012:role/ecsTaskRole

# Networking
AWS_VPC_ID=vpc-0123456789abcdef0
AWS_SUBNET_IDS=subnet-abc123,subnet-def456
AWS_SECURITY_GROUP_IDS=sg-abc123,sg-def456

# Application
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-nextauth-secret-here

# AI Services (optional)
FAL_KEY=xxxxx
OPENAI_API_KEY=sk-xxxxx
```

## Security Best Practices

1. **Never commit `.env` files to version control**
   - Add `.env*` to `.gitignore`
   - Use `.env.example` as a template

2. **Use strong, unique values for secrets**
   - Generate secrets: `openssl rand -base64 32`
   - Use unique values for each environment

3. **Rotate credentials regularly**
   - AWS access keys: Every 90 days
   - API tokens: Every 6 months
   - Database passwords: Annually

4. **Use IAM roles in production**
   - Prefer ECS task roles over access keys when possible
   - Use AWS Secrets Manager for sensitive data

5. **Separate environments**
   - Use different credentials for dev/staging/prod
   - Never use production credentials in development

6. **Audit access**
   - Enable AWS CloudTrail
   - Monitor API key usage in dashboard
   - Review permissions regularly

## Troubleshooting

### "AWS credentials not found"

```bash
# Verify AWS CLI is configured
aws configure list

# Test credentials
aws sts get-caller-identity

# Set environment variables
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=AKIAXXXXX
export AWS_SECRET_ACCESS_KEY=xxxxxxxx
```

### "ECS cluster not found"

```bash
# List ECS clusters
aws ecs list-clusters --region us-east-1

# Verify cluster name matches ECS_CLUSTER_NAME
echo $ECS_CLUSTER_NAME
```

### "VPC or subnet not found"

```bash
# List VPCs
aws ec2 describe-vpcs --region us-east-1

# List subnets
aws ec2 describe-subnets --vpc-id $AWS_VPC_ID

# Verify comma-separated format
echo $AWS_SUBNET_IDS
```

### "Database connection failed"

```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1;"

# Check format
# postgresql://username:password@hostname:5432/database?sslmode=require

# Verify network access
# Database must be accessible from your application
```

## Getting Help

For issues:

- Documentation: https://elizacloud.ai/docs
- Support: support@elizacloud.ai
- Discord: https://discord.gg/elizaos

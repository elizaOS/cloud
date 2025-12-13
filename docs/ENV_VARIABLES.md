# Environment Variables Documentation

## Required Environment Variables for Bootstrapper Deployment

### Database
- `DATABASE_URL` - PostgreSQL connection string

### Authentication (WorkOS)
- `WORKOS_CLIENT_ID` - WorkOS client ID
- `WORKOS_API_KEY` - WorkOS API key
- `WORKOS_REDIRECT_URI` - OAuth redirect URI
- `WORKOS_COOKIE_PASSWORD` - Cookie encryption password (32+ chars)

### Stripe (for billing)
- `STRIPE_SECRET_KEY` - Stripe secret key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook secret
- `STRIPE_PUBLISHABLE_KEY` - Stripe publishable key
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Public Stripe key for frontend

### Cloudflare R2 Storage (for artifacts)
- `R2_ACCOUNT_ID` - Cloudflare account ID
- `R2_BUCKET_NAME` - R2 bucket name (default: eliza-artifacts)
- `R2_ACCESS_KEY_ID` - R2 access key ID
- `R2_SECRET_ACCESS_KEY` - R2 secret access key
- `R2_ENDPOINT` - R2 endpoint URL (format: https://<account-id>.r2.cloudflarestorage.com)
- `R2_PUBLIC_DOMAIN` - Public domain for R2 bucket (optional, for CDN access)

### Cloudflare API (for container deployment)
- `CLOUDFLARE_ACCOUNT_ID` - Cloudflare account ID
- `CLOUDFLARE_API_TOKEN` - Cloudflare API token with container permissions

### Application
- `NEXT_PUBLIC_APP_URL` - Public URL of the application

## Optional Environment Variables

### AI Services
- `FAL_KEY` - Fal.ai API key for image/video generation
- `OPENAI_API_KEY` - OpenAI API key for chat features

## CLI Environment Variables

For the ElizaOS CLI to use the bootstrapper deployment:

- `ELIZAOS_API_KEY` or `ELIZA_CLOUD_API_KEY` - Your ElizaOS Cloud API key
- `ELIZAOS_API_URL` or `ELIZA_CLOUD_API_URL` - ElizaOS Cloud API URL (default: https://elizacloud.ai)

## Container Runtime Environment Variables

These are injected into containers during bootstrapper deployment:

- `R2_ARTIFACT_URL` - URL to fetch the project artifact
- `R2_TOKEN` - One-time token for R2 access
- `R2_ARTIFACT_CHECKSUM` - SHA256 checksum for verification
- `START_CMD` - Command to start the application (default: bun run start)
- `PORT` - Port the application listens on (default: 3000)
- `SKIP_BUILD` - Skip build step if set to "true"
- `ENV_VARS` - Additional environment variables for the application

## Security Notes

1. Never commit `.env` files to version control
2. Use strong, unique values for secrets and tokens
3. Rotate API tokens regularly
4. Use environment-specific values for different deployments
5. Store production secrets in a secure secret manager

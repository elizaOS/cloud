# ElizaOS Bootstrapper - Cloudflare Deployment

A lightweight container that downloads ElizaOS projects from R2 and runs them on Cloudflare Workers.

## Quick Start

### 1. Install Wrangler

```bash
npm install -g wrangler
wrangler login
```

### 2. Deploy to Cloudflare Registry

```bash
# Use the helper script
./deploy-to-cloudflare.sh v1.0.0

# Or manually
wrangler containers push elizaos-bootstrapper:latest
```

### 3. Configure Environment

Update your platform `.env`:

```bash
BOOTSTRAPPER_IMAGE_TAG=registry.cloudflare.com/YOUR_ACCOUNT_ID/elizaos-bootstrapper:latest
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_API_TOKEN=your_api_token
R2_ACCESS_KEY_ID=your_r2_key
R2_SECRET_ACCESS_KEY=your_r2_secret
R2_BUCKET_NAME=eliza-artifacts
R2_ENDPOINT=https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
```

Get your account ID: `wrangler whoami`

### 4. Start Platform & Deploy

```bash
cd ..
npm run build && npm start

# Deploy an agent
cd your-project
elizaos deploy --name my-agent
```

## How It Works

```
1. CLI uploads artifact → R2
2. Platform tells Cloudflare to deploy
3. Cloudflare pulls bootstrapper from registry.cloudflare.com
4. Bootstrapper downloads artifact from R2
5. Bootstrapper extracts and runs your project
```

## Environment Variables

The bootstrapper container receives these automatically:

- `R2_ARTIFACT_URL` - Presigned URL to download artifact (auto-set)
- `PORT` - Port to run on (default: 3000)
- `START_CMD` - Command to run (default: "bun run start")
- `SKIP_BUILD` - Skip build step (default: false)

Plus any environment variables you pass via `elizaos deploy --env`.

## Commands Reference

```bash
# Push image to Cloudflare
wrangler containers push IMAGE:TAG

# Build and push in one step
wrangler containers build -p -t IMAGE:TAG .

# List images in Cloudflare registry
wrangler containers images list

# Get account info
wrangler whoami

# List deployed containers
wrangler containers list
```

## Verify Setup

```bash
# Check Wrangler installed
wrangler --version

# Check logged in
wrangler whoami

# Check image in registry
wrangler containers images list

# Check env variable correct
grep BOOTSTRAPPER_IMAGE_TAG ../.env
# Should show: registry.cloudflare.com/...
```

## Registry Path Format

Images are stored at:
```
registry.cloudflare.com/ACCOUNT_ID/IMAGE_NAME:TAG
```

Example:
```
registry.cloudflare.com/abc123def456/elizaos-bootstrapper:latest
```

## Troubleshooting

**"Wrangler not found"**
```bash
npm install -g wrangler
```

**"Not logged in"**
```bash
wrangler login
```

**"Docker not running"**
```bash
# Start Docker Desktop, then retry
```

**"Image not found when deploying"**
```bash
# Ensure env uses full path:
BOOTSTRAPPER_IMAGE_TAG=registry.cloudflare.com/ACCOUNT_ID/elizaos-bootstrapper:latest

# Not just:
# BOOTSTRAPPER_IMAGE_TAG=elizaos-bootstrapper:latest
```

## Files

- `Dockerfile` - Container definition
- `bootstrap.sh` - Startup script (downloads from R2, runs project)
- `deploy-to-cloudflare.sh` - Helper script to build and push
- `build.sh` - Legacy build script (deprecated)

## Architecture

The bootstrapper enables efficient deployments:

- **Small image** (~50MB) - Only contains download tools
- **Fast deployments** - Artifact downloads happen at runtime
- **Versioned artifacts** - Easy rollbacks via R2
- **Secure** - Presigned URLs expire after 1 hour
- **Global** - Runs on Cloudflare's edge network

## Security

- Uses presigned URLs (no long-lived credentials)
- Validates artifact checksums
- Validates tar.gz structure before extraction
- Sanitizes all environment variables
- No sensitive data in container image

## Limits

- **Image size:** Max 2 GB (current: ~50MB)
- **Account storage:** Max 50 GB total
- **Architecture:** Must be linux/amd64

## Cost

**Cloudflare Registry:** Included, no extra charge  
**R2 Storage:** $0.015/GB/month (10 GB free)  
**Container Execution:** Usage-based (~$5-20/month)

**Total: ~$10-30/month for production**

## Development

To test locally:

```bash
docker build -t test-bootstrapper .
docker run -it --rm \
  -e R2_ARTIFACT_URL="https://presigned-url..." \
  -p 3000:3000 \
  test-bootstrapper
```

## Documentation

- Main README: `../README.md` → "Cloudflare Container Deployment"
- Cloudflare docs: https://developers.cloudflare.com/containers/
- Config checker: `../scripts/check-bootstrapper-config.ts`

## Support

For issues:
1. Run config checker: `tsx ../scripts/check-bootstrapper-config.ts`
2. Check Cloudflare logs: Dashboard → Workers → Your worker → Logs
3. Verify registry: `wrangler containers images list`
4. Check docs: https://developers.cloudflare.com/containers/

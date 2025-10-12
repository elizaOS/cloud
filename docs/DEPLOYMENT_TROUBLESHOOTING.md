# ElizaOS Deployment Troubleshooting Guide

Complete guide for diagnosing and fixing deployment issues in ElizaOS Cloud.

## Table of Contents
- [Pre-Deployment Checks](#pre-deployment-checks)
- [Deployment Process Stages](#deployment-process-stages)
- [Common Errors](#common-errors)
- [Diagnostic Commands](#diagnostic-commands)
- [Advanced Debugging](#advanced-debugging)

## Pre-Deployment Checks

Before deploying, verify:

### 1. Environment Configuration
```bash
# Check all required variables are set
elizaos config validate  # Future CLI command

# Or manually verify .env.local has:
- DATABASE_URL
- WORKOS_CLIENT_ID, WORKOS_API_KEY, WORKOS_COOKIE_PASSWORD
- CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN
- R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
- R2_ENDPOINT, R2_BUCKET_NAME
```

### 2. API Key
```bash
# Get API key from dashboard
# Visit: https://your-app.com/dashboard/api-keys

# Set in environment
export ELIZAOS_API_KEY="eliza_your_key_here"
```

### 3. Project Validity
```bash
# Ensure you're in a valid ElizaOS project
ls -la package.json  # Should exist
grep "@elizaos/core" package.json  # Should be present

# Test build locally
bun install
bun run build
```

### 4. Credit Balance
```bash
# Check you have enough credits
# Visit: https://your-app.com/dashboard/credits
# Or via API:
curl https://your-app.com/api/v1/containers/quota \
  -H "Authorization: Bearer $ELIZAOS_API_KEY"
```

## Deployment Process Stages

Understanding the deployment flow helps diagnose where failures occur:

```
Stage 1: Artifact Creation
  ├─ CLI creates tar.gz of project
  ├─ Calculates checksum (SHA256)
  └─ Validates size (max 500MB)

Stage 2: Artifact Upload
  ├─ CLI requests upload URL from API
  ├─ API generates temporary R2 credentials
  ├─ API generates presigned upload URL
  ├─ CLI uploads to R2 using presigned URL
  └─ API records artifact in database

Stage 3: Container Creation
  ├─ API validates quota and credits
  ├─ API creates container record (status: pending)
  ├─ API deducts credits
  └─ Returns container ID to CLI

Stage 4: Cloudflare Deployment
  ├─ API creates Worker script
  ├─ API deploys container binding
  ├─ API creates Worker route
  ├─ Container status → building
  └─ Container status → deploying

Stage 5: Bootstrapper Execution
  ├─ Worker starts bootstrapper container
  ├─ Bootstrapper downloads artifact from R2
  ├─ Validates checksum
  ├─ Extracts and installs dependencies
  ├─ Runs start command
  ├─ Container status → running
  └─ Health checks begin

Stage 6: Monitoring
  ├─ Periodic health checks (every 60s)
  ├─ Status updates in database
  └─ Alerts on failures
```

## Common Errors

### Error: "Bootstrapper image not found"

**Cause**: The `elizaos/bootstrapper:latest` Docker image doesn't exist or isn't accessible

**Solution**:
```bash
# Build the bootstrapper image
cd eliza-cloud-v2/bootstrapper
./build.sh v1.0.0

# Publish to Docker Hub (requires authentication)
docker login
docker push elizaos/bootstrapper:latest
docker push elizaos/bootstrapper:v1.0.0

# Or use GitHub Container Registry
docker tag elizaos/bootstrapper:latest ghcr.io/elizaos/bootstrapper:latest
docker push ghcr.io/elizaos/bootstrapper:latest
```

### Error: "Failed to generate presigned URL"

**Cause**: R2 credentials are invalid or temporary credentials API failed

**Solution**:
```bash
# Verify R2 credentials
aws s3 ls --endpoint-url=$R2_ENDPOINT

# Check Cloudflare API token has R2 permissions
curl -X GET "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/r2/buckets" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"

# Verify bucket exists
curl -X GET "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/r2/buckets/eliza-artifacts" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
```

### Error: "Checksum validation failed"

**Cause**: Artifact was corrupted during upload or download

**Solution**:
```bash
# Delete the corrupted artifact
curl -X DELETE "https://your-app.com/api/v1/artifacts/{artifact-id}" \
  -H "Authorization: Bearer $ELIZAOS_API_KEY"

# Re-deploy to create fresh artifact
elizaos deploy --name my-agent
```

### Error: "Worker creation failed"

**Cause**: Cloudflare Workers API error or insufficient permissions

**Solution**:
```bash
# Verify Cloudflare API token has Workers permissions
# Required scopes: "Workers Scripts Write", "Workers Routes Write"

# Check Workers quota
curl -X GET "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"

# Verify account is enabled for Workers
# Visit: https://dash.cloudflare.com → Workers & Pages
```

### Error: "Container binding failed"

**Cause**: Invalid container configuration or Cloudflare API error

**Solution**:
```bash
# Check Worker exists
curl -X GET "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/{worker-id}" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"

# Verify container configuration
# Check for valid:
# - image_tag (must be accessible Docker image)
# - port (1-65535)
# - max_instances (1-10)
# - environment_vars (valid JSON object)
```

### Error: "Deployment timeout"

**Cause**: Deployment took longer than 5 minutes (default timeout)

**Solution**:
```bash
# Check deployment status manually
curl https://your-app.com/api/v1/containers/{container-id} \
  -H "Authorization: Bearer $ELIZAOS_API_KEY"

# Status transitions:
# pending → building → deploying → running (success)
#                               → failed (error)

# If stuck in building/deploying for >5 mins:
# 1. Check Cloudflare Worker logs
# 2. Verify bootstrapper can download artifact
# 3. Check artifact size and network speed
```

## Diagnostic Commands

### Check System Status
```bash
# Verify all features are configured
curl https://your-app.com/api/health \
  -H "Authorization: Bearer $ELIZAOS_API_KEY"

# Check available models
curl https://your-app.com/api/v1/models

# List deployed containers
curl https://your-app.com/api/v1/containers \
  -H "Authorization: Bearer $ELIZAOS_API_KEY"
```

### Check Specific Container
```bash
CONTAINER_ID="your-container-id"
API_KEY="your-api-key"

# Get container details
curl https://your-app.com/api/v1/containers/$CONTAINER_ID \
  -H "Authorization: Bearer $API_KEY" | jq .

# Check health
curl https://your-app.com/api/v1/containers/$CONTAINER_ID/health \
  -H "Authorization: Bearer $API_KEY" | jq .
```

### Check Artifacts
```bash
# List artifacts
curl https://your-app.com/api/v1/artifacts \
  -H "Authorization: Bearer $API_KEY" | jq .

# Get artifact stats
curl https://your-app.com/api/v1/artifacts/stats \
  -H "Authorization: Bearer $API_KEY" | jq .
```

### Check Quota and Credits
```bash
# Check quota
curl https://your-app.com/api/v1/containers/quota \
  -H "Authorization: Bearer $API_KEY" | jq .

# Response includes:
# - quota.max: Maximum allowed containers
# - quota.current: Current container count
# - quota.remaining: Available slots
# - credits.balance: Current credit balance
# - pricing.totalForNewContainer: Cost estimate
```

## Advanced Debugging

### Enable Debug Mode
```bash
# Deploy with verbose logging
elizaos deploy --name my-agent --verbose

# Or set environment variable
export ELIZAOS_DEBUG=true
elizaos deploy --name my-agent
```

### Test Artifact Download Locally
```bash
# Download artifact manually to test accessibility
ARTIFACT_URL="https://your-r2-endpoint/bucket/path/artifact.tar.gz"

curl -f "$ARTIFACT_URL" -o test-artifact.tar.gz

# Verify checksum
sha256sum test-artifact.tar.gz

# Extract and inspect
tar -xzf test-artifact.tar.gz -C test-dir/
ls -la test-dir/
```

### Test Bootstrapper Locally
```bash
# Build bootstrapper
cd eliza-cloud-v2/bootstrapper
./build.sh test

# Run with your artifact
docker run -it --rm \
  -e R2_ARTIFACT_URL="$ARTIFACT_URL" \
  -e R2_ACCESS_KEY_ID="$ACCESS_KEY" \
  -e R2_SECRET_ACCESS_KEY="$SECRET_KEY" \
  -e R2_SESSION_TOKEN="$SESSION_TOKEN" \
  -e R2_ENDPOINT="$ENDPOINT" \
  -e R2_BUCKET_NAME="eliza-artifacts" \
  -e START_CMD="bun run start" \
  -p 3000:3000 \
  elizaos/bootstrapper:test

# Container should:
# 1. Download artifact
# 2. Validate checksum
# 3. Extract files
# 4. Install dependencies
# 5. Start your app on port 3000
```

### Database Inspection
```bash
# Connect to database
psql $DATABASE_URL

# Check containers
SELECT id, name, status, error_message, created_at 
FROM containers 
WHERE organization_id = 'your-org-id'
ORDER BY created_at DESC;

# Check artifacts
SELECT id, project_id, version, size, created_at 
FROM artifacts 
WHERE organization_id = 'your-org-id'
ORDER BY created_at DESC;

# Check credit transactions
SELECT amount, type, description, created_at 
FROM credit_transactions 
WHERE organization_id = 'your-org-id'
ORDER BY created_at DESC 
LIMIT 20;
```

### Cloudflare Worker Debugging
```bash
# List Workers
curl -X GET "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq .

# Get Worker details
curl -X GET "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/{worker-name}" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq .

# Tail Worker logs (requires wrangler)
wrangler tail {worker-name}
```

## Getting Help

If you're still stuck after trying these solutions:

1. **Check the logs**: Application logs contain detailed error information
2. **Review the docs**: See `/docs` folder for detailed documentation
3. **GitHub Issues**: Search existing issues or create a new one
4. **Discord Community**: Join the ElizaOS Discord for community support
5. **Support**: Contact support@eliza.cloud for enterprise customers

## Deployment Checklist

Before deploying:
- [ ] All environment variables are set and validated
- [ ] API key is generated and active
- [ ] Credit balance is sufficient (check quota endpoint)
- [ ] Project builds successfully locally (`bun run build`)
- [ ] Bootstrapper image is built and published
- [ ] R2 bucket exists and is accessible
- [ ] Cloudflare account has Workers enabled
- [ ] Network allows outbound connections to Cloudflare and R2

After deployment:
- [ ] Container status is "running"
- [ ] Health check returns 200 OK
- [ ] Application is accessible at deployed URL
- [ ] Logs show no errors
- [ ] Credits were deducted correctly


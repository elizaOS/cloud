# ElizaOS Cloud API Reference

Complete API documentation for ElizaOS Cloud V2.

**Base URL:** `https://your-domain.com/api/v1`  
**Authentication:** Bearer token (API Key) or Session cookie  
**Content-Type:** `application/json`

## Authentication

All protected endpoints require authentication via one of:

1. **API Key** (Recommended for CLI/programmatic access):

```bash
Authorization: Bearer eliza_your_api_key_here
```

2. **Session Cookie** (Automatic for dashboard):
   - Managed by WorkOS AuthKit
   - Automatically included in browser requests

### Get API Key

Visit `/dashboard/api-keys` to create an API key.

## Rate Limits

| Endpoint Type   | Limit       | Window    |
| --------------- | ----------- | --------- |
| Standard API    | 60 requests | 1 minute  |
| Deployments     | 5 requests  | 5 minutes |
| Artifact Upload | 10 requests | 1 minute  |

Rate limit headers included in responses:

- `X-RateLimit-Limit` - Maximum requests allowed
- `X-RateLimit-Remaining` - Requests remaining in window
- `X-RateLimit-Reset` - When the limit resets
- `Retry-After` - Seconds until you can retry (on 429 errors)

---

## Containers

### List Containers

`GET /api/v1/containers`

Get all containers for your organization.

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "my-agent",
      "status": "running",
      "cloudflare_url": "https://my-agent-abc123.workers.dev",
      "port": 3000,
      "max_instances": 1,
      "created_at": "2025-10-12T10:00:00.000Z"
    }
  ]
}
```

**Status Values:**

- `pending` - Container created, waiting for deployment
- `building` - Building container image
- `deploying` - Deploying to Cloudflare
- `running` - Container is live and healthy
- `failed` - Deployment or health check failed
- `stopped` - Container was manually stopped
- `deleting` - Container is being removed

---

### Create Container

`POST /api/v1/containers`

Deploy a new container.

**Rate Limit:** 5 requests per 5 minutes

**Request Body:**

```json
{
  "name": "my-agent",
  "description": "My ElizaOS agent",
  "port": 3000,
  "max_instances": 1,
  "environment_vars": {
    "OPENAI_API_KEY": "sk-...",
    "DATABASE_URL": "postgresql://..."
  },
  "health_check_path": "/health",
  "use_bootstrapper": true,
  "artifact_url": "https://r2-endpoint/bucket/path/artifact.tar.gz",
  "artifact_checksum": "sha256_hash",
  "image_tag": "elizaos/bootstrapper:latest"
}
```

**Response (Success):**

```json
{
  "success": true,
  "data": {
    "id": "container-uuid",
    "name": "my-agent",
    "status": "pending",
    ...
  },
  "message": "Container deployment initiated",
  "creditsDeducted": 1000,
  "creditsRemaining": 9000
}
```

**Response (Insufficient Credits):**

```json
{
  "success": false,
  "error": "Insufficient credits. Required: 1000, Available: 500",
  "requiredCredits": 1000,
  "availableCredits": 500
}
```

Status: `402 Payment Required`

**Response (Quota Exceeded):**

```json
{
  "success": false,
  "error": "Container limit reached...",
  "quota": {
    "current": 5,
    "max": 5
  }
}
```

Status: `403 Forbidden`

---

### Get Container

`GET /api/v1/containers/{id}`

Get details for a specific container.

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "my-agent",
    "status": "running",
    "cloudflare_worker_id": "my-agent",
    "cloudflare_url": "https://my-agent-abc123.workers.dev",
    "port": 3000,
    "max_instances": 1,
    "environment_vars": { ... },
    "last_deployed_at": "2025-10-12T10:00:00.000Z",
    "last_health_check": "2025-10-12T10:05:00.000Z",
    "deployment_log": "Deployed successfully...",
    "error_message": null,
    "created_at": "2025-10-12T09:30:00.000Z"
  }
}
```

---

### Delete Container

`DELETE /api/v1/containers/{id}`

Delete a container deployment.

**Response:**

```json
{
  "success": true,
  "message": "Container deleted successfully"
}
```

---

### Get Container Health

`GET /api/v1/containers/{id}/health`

Check health status of a container.

**Response:**

```json
{
  "success": true,
  "data": {
    "containerId": "uuid",
    "healthy": true,
    "statusCode": 200,
    "responseTime": 45,
    "checkedAt": "2025-10-12T10:10:00.000Z",
    "containerStatus": "running",
    "lastHealthCheck": "2025-10-12T10:05:00.000Z"
  }
}
```

---

### Get Container Quota

`GET /api/v1/containers/quota`

Get quota and pricing information.

**Response:**

```json
{
  "success": true,
  "data": {
    "quota": {
      "max": 10,
      "current": 3,
      "remaining": 7
    },
    "credits": {
      "balance": 15000
    },
    "pricing": {
      "totalForNewContainer": 1000,
      "imageUpload": 500,
      "containerDeployment": 500
    }
  }
}
```

---

## ECR Image Building

### Request ECR Credentials

`POST /api/v1/containers/credentials`

Request ECR repository and authentication credentials for building and pushing Docker images.

**Rate Limit:** 10 requests per minute

**Request Body:**

```json
{
  "projectId": "my-project",
  "version": "1.0.0",
  "metadata": {
    "elizaVersion": "1.6.1",
    "nodeVersion": "v20.11.0"
  }
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "ecrRepositoryUri": "123456789.dkr.ecr.us-east-1.amazonaws.com/elizaos/org-id/my-project",
    "ecrImageUri": "123456789.dkr.ecr.us-east-1.amazonaws.com/elizaos/org-id/my-project:1.0.0-1729080000000",
    "ecrImageTag": "1.0.0-1729080000000",
    "authToken": "BASE64_ENCODED_TOKEN",
    "authTokenExpiresAt": "2025-10-16T12:00:00.000Z",
    "registryEndpoint": "123456789.dkr.ecr.us-east-1.amazonaws.com"
  }
}
```

**Usage:**

The `elizaos deploy` CLI command handles this automatically:

```bash
elizaos deploy
```

Or manually:

```bash
# 1. Request ECR credentials
RESPONSE=$(curl -X POST https://elizacloud.ai/api/v1/containers/credentials \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"projectId":"my-project","version":"1.0.0"}')

# 2. Extract ECR credentials
ECR_IMAGE_URI=$(echo $RESPONSE | jq -r '.data.ecrImageUri')
AUTH_TOKEN=$(echo $RESPONSE | jq -r '.data.authToken')
REGISTRY=$(echo $RESPONSE | jq -r '.data.registryEndpoint')

# 3. Docker login to ECR
echo $AUTH_TOKEN | docker login --username AWS --password-stdin $REGISTRY

# 4. Build and push Docker image
docker build -t $ECR_IMAGE_URI .
docker push $ECR_IMAGE_URI

# 5. Create container deployment
curl -X POST https://elizacloud.ai/api/v1/containers \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"my-project\",
    \"ecr_image_uri\": \"$ECR_IMAGE_URI\",
    \"port\": 3000,
    \"desired_count\": 1,
    \"cpu\": 256,
    \"memory\": 512
  }"

# 3. Upload artifact
curl -X PUT "$UPLOAD_URL" \
  -H "Content-Type: application/gzip" \
  --data-binary @artifact.tar.gz
```

---

### List Artifacts

`GET /api/v1/artifacts`

List artifacts for your organization.

**Query Parameters:**

- `projectId` (optional) - Filter by project
- `limit` (optional) - Max results (default: 50)
- `offset` (optional) - Pagination offset

**Response:**

```json
{
  "success": true,
  "data": {
    "artifacts": [
      {
        "id": "artifact-uuid",
        "project_id": "my-project",
        "version": "1.0.0",
        "size": 10485760,
        "checksum": "sha256_hash",
        "created_at": "2025-10-12T10:00:00.000Z"
      }
    ],
    "total": 15,
    "limit": 50,
    "offset": 0
  }
}
```

---

### Get Artifact Stats

`GET /api/v1/artifacts/stats`

Get artifact statistics for your organization.

**Response:**

```json
{
  "success": true,
  "data": {
    "totalArtifacts": 25,
    "totalSizeBytes": 262144000,
    "totalSizeMB": "250.00",
    "projectCount": 5,
    "oldestArtifact": "2025-09-01T00:00:00.000Z",
    "newestArtifact": "2025-10-12T10:00:00.000Z"
  }
}
```

---

## API Keys

### List API Keys

`GET /api/v1/api-keys`

List all API keys for your organization.

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Production Deployment Key",
      "key_prefix": "eliza_abc",
      "is_active": true,
      "usage_count": 42,
      "rate_limit": 1000,
      "expires_at": null,
      "last_used_at": "2025-10-12T09:00:00.000Z",
      "created_at": "2025-10-01T00:00:00.000Z"
    }
  ]
}
```

---

### Create API Key

`POST /api/v1/api-keys`

Create a new API key.

**Request Body:**

```json
{
  "name": "My Deployment Key",
  "description": "Used for CI/CD deployments",
  "permissions": ["containers:write", "artifacts:write"],
  "rate_limit": 1000,
  "expires_at": "2026-10-12T00:00:00.000Z"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "My Deployment Key",
    "key": "eliza_abc123def456...",
    "key_prefix": "eliza_abc",
    "created_at": "2025-10-12T10:00:00.000Z"
  },
  "warning": "Save this key now - it won't be shown again"
}
```

**⚠️ Important:** The full `key` is only returned once. Save it securely.

---

### Regenerate API Key

`POST /api/v1/api-keys/{id}/regenerate`

Regenerate an API key (invalidates old key).

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "key": "eliza_new_key_here",
    "key_prefix": "eliza_new"
  }
}
```

---

### Delete API Key

`DELETE /api/v1/api-keys/{id}`

Delete an API key.

**Response:**

```json
{
  "success": true,
  "message": "API key deleted"
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": { ... }
}
```

### Common Error Codes

| Code                     | Status | Description                       |
| ------------------------ | ------ | --------------------------------- |
| `UNAUTHORIZED`           | 401    | Invalid or missing authentication |
| `FORBIDDEN`              | 403    | Insufficient permissions          |
| `NOT_FOUND`              | 404    | Resource not found                |
| `VALIDATION_ERROR`       | 400    | Invalid request data              |
| `QUOTA_EXCEEDED`         | 403    | Container quota limit reached     |
| `INSUFFICIENT_CREDITS`   | 402    | Not enough credits                |
| `RATE_LIMIT_EXCEEDED`    | 429    | Too many requests                 |
| `CLOUDFLARE_API_ERROR`   | 502    | Cloudflare API failure            |
| `ARTIFACT_UPLOAD_FAILED` | 500    | Artifact upload failed            |
| `DEPLOYMENT_FAILED`      | 500    | Container deployment failed       |
| `TIMEOUT`                | 504    | Operation timed out               |

### Error Handling Example

```typescript
try {
  const response = await fetch("https://api.eliza.cloud/api/v1/containers", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(containerConfig),
  });

  const data = await response.json();

  if (!data.success) {
    // Handle specific error codes
    switch (data.code) {
      case "INSUFFICIENT_CREDITS":
        console.error("Buy more credits:", data.details);
        break;
      case "QUOTA_EXCEEDED":
        console.error("Delete unused containers:", data.quota);
        break;
      default:
        console.error("Error:", data.error);
    }
    return;
  }

  // Success
  console.log("Container created:", data.data.id);
} catch (error) {
  console.error("Network error:", error);
}
```

## Webhooks

### Stripe Webhook

`POST /api/stripe/webhook`

Handles Stripe payment webhooks.

**Headers:**

- `stripe-signature` - Webhook signature for verification

**Events Handled:**

- `payment_intent.succeeded` - Credits added to account
- `payment_intent.payment_failed` - Payment failed

---

## Cron Endpoints

### Cleanup Artifacts

`POST /api/v1/cron/cleanup-artifacts`

Cleans up old artifacts based on retention policy.

**Authentication:** Requires `CRON_SECRET` in Authorization header

```bash
curl -X POST https://your-app.com/api/v1/cron/cleanup-artifacts \
  -H "Authorization: Bearer $CRON_SECRET"
```

**Response:**

```json
{
  "success": true,
  "data": {
    "deleted": 15,
    "errors": 0,
    "timestamp": "2025-10-12T10:00:00.000Z"
  }
}
```

---

## Models

### List Available Models

`GET /api/v1/models`

Get list of available AI models.

**Public endpoint** - No authentication required

**Response:**

```json
{
  "models": [
    {
      "id": "gpt-4o",
      "name": "GPT-4 Optimized",
      "provider": "openai",
      "capabilities": ["chat", "completion"]
    },
    {
      "id": "claude-3-sonnet",
      "name": "Claude 3 Sonnet",
      "provider": "anthropic",
      "capabilities": ["chat"]
    }
  ]
}
```

---

## Rate Limiting Response

When rate limited, you'll receive:

```json
{
  "success": false,
  "error": "Too many requests",
  "retryAfter": 60
}
```

**Headers:**

```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 2025-10-12T10:05:00.000Z
Retry-After: 60
```

**Handling:**

```typescript
if (response.status === 429) {
  const retryAfter = parseInt(response.headers.get("Retry-After") || "60");
  console.log(`Rate limited. Retry after ${retryAfter} seconds`);
  await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
  // Retry request
}
```

---

## SDKs and Examples

### JavaScript/TypeScript

```typescript
import { ElizaCloudClient } from "@elizaos/cloud-client";

const client = new ElizaCloudClient({
  apiKey: process.env.ELIZAOS_API_KEY,
  baseUrl: "https://eliza.cloud",
});

// Deploy container
const container = await client.containers.create({
  name: "my-agent",
  artifactUrl: "...",
  port: 3000,
});

// Check health
const health = await client.containers.getHealth(container.id);
console.log("Container healthy:", health.healthy);
```

### cURL Examples

```bash
# Set API key
export API_KEY="eliza_your_key_here"
export BASE_URL="https://eliza.cloud/api/v1"

# List containers
curl "$BASE_URL/containers" \
  -H "Authorization: Bearer $API_KEY"

# Create container
curl -X POST "$BASE_URL/containers" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-agent",
    "port": 3000,
    "max_instances": 1,
    "artifact_url": "...",
    "use_bootstrapper": true
  }'

# Check quota
curl "$BASE_URL/containers/quota" \
  -H "Authorization: Bearer $API_KEY"

# Get container health
curl "$BASE_URL/containers/{id}/health" \
  -H "Authorization: Bearer $API_KEY"

# Upload artifact (2-step process)
# Step 1: Request upload URL
curl -X POST "$BASE_URL/artifacts/upload" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "my-project",
    "version": "1.0.0",
    "checksum": "sha256_hash",
    "size": 1048576
  }' > response.json

# Step 2: Upload to presigned URL
UPLOAD_URL=$(jq -r '.data.upload.url' response.json)
curl -X PUT "$UPLOAD_URL" \
  -H "Content-Type: application/gzip" \
  --data-binary @artifact.tar.gz
```

---

## Pagination

Endpoints that return lists support pagination:

**Query Parameters:**

- `limit` - Items per page (default: 50, max: 100)
- `offset` - Number of items to skip

**Response:**

```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "total": 150,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

---

## Versioning

Current API version: **v1**

Future versions will be available at `/api/v2`, `/api/v3`, etc.

Deprecated endpoints will:

1. Be documented as deprecated for 90 days
2. Return `Deprecation` header with sunset date
3. Be removed after sunset date

---

## Support

- **Documentation**: https://docs.eliza.cloud
- **Status Page**: https://status.eliza.cloud
- **Support**: support@eliza.cloud
- **Discord**: https://discord.gg/elizaos

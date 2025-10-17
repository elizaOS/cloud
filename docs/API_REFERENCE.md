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
| ECR Credentials | 10 requests | 1 minute  |

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
      "load_balancer_url": "http://my-agent-alb-123456.us-east-1.elb.amazonaws.com",
      "ecs_service_arn": "arn:aws:ecs:us-east-1:123456789012:service/elizaos-cluster/my-agent",
      "port": 3000,
      "desired_count": 1,
      "cpu": 256,
      "memory": 512,
      "created_at": "2025-10-12T10:00:00.000Z"
    }
  ]
}
```

**Status Values:**

- `pending` - Container created, waiting for deployment
- `building` - Building Docker image
- `deploying` - Deploying to AWS ECS
- `running` - Container is live and healthy
- `failed` - Deployment or health check failed
- `stopped` - Container was manually stopped
- `deleting` - Container is being removed

---

### Create Container

`POST /api/v1/containers`

Deploy a new container to AWS ECS.

**Rate Limit:** 5 requests per 5 minutes

**Request Body:**

```json
{
  "name": "my-agent",
  "description": "My ElizaOS agent",
  "port": 3000,
  "desired_count": 1,
  "cpu": 256,
  "memory": 512,
  "ecr_image_uri": "123456789012.dkr.ecr.us-east-1.amazonaws.com/elizaos/my-org/my-project:v1.0.0-1234567890",
  "ecr_repository_uri": "123456789012.dkr.ecr.us-east-1.amazonaws.com/elizaos/my-org/my-project",
  "image_tag": "v1.0.0-1234567890",
  "environment_vars": {
    "OPENAI_API_KEY": "sk-...",
    "DATABASE_URL": "postgresql://..."
  },
  "health_check_path": "/health"
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
    "ecr_repository_uri": "123456789012.dkr.ecr.us-east-1.amazonaws.com/elizaos/my-org/my-project",
    "ecr_image_tag": "v1.0.0-1234567890",
    "port": 3000,
    "desired_count": 1,
    "cpu": 256,
    "memory": 512,
    "created_at": "2025-10-12T10:00:00.000Z"
  },
  "message": "Container deployment initiated. Check status for deployment progress.",
  "creditsDeducted": 1000,
  "creditsRemaining": 9000
}
```

**Response (Insufficient Credits):**

```json
{
  "success": false,
  "error": "Insufficient credits. Required: 1000, Available: 500",
  "requiredCredits": 1000
}
```

Status: `402 Payment Required`

**Response (Quota Exceeded):**

```json
{
  "success": false,
  "error": "Container limit reached (5). Delete unused containers or contact support.",
  "quota": {
    "current": 5,
    "max": 5
  }
}
```

Status: `403 Forbidden`

**Field Descriptions:**

- `name` **(required)**: Container name (alphanumeric, hyphens allowed)
- `description`: Optional description of the container
- `port`: Port the container listens on (1-65535, default: 3000)
- `desired_count`: Number of container tasks to run (1-10, default: 1)
- `cpu`: CPU units (256 = 0.25 vCPU, 512 = 0.5 vCPU, 1024 = 1 vCPU, default: 256)
- `memory`: Memory in MB (minimum 512, default: 512)
- `ecr_image_uri` **(required)**: Full ECR image URI with tag
- `ecr_repository_uri`: ECR repository URI (optional)
- `image_tag`: Image tag (optional)
- `environment_vars`: Environment variables (max 50 vars, 32KB per var)
- `health_check_path`: HTTP path for health checks (default: `/health`)

**Credit Costs:**

- Base deployment: 1000 credits ($10)
- Additional instances: 50 credits per instance per hour
- Higher CPU/memory allocations incur additional charges

**Validation Rules:**

- Container name must be unique within your organization
- Port must be between 1 and 65535
- Desired count cannot exceed 10
- CPU must be one of: 256, 512, 1024, 2048, 4096
- Memory must be at least 512 MB
- Environment variable names must start with letter/underscore
- Environment variable values cannot exceed 32KB each
- Maximum 50 environment variables total
- ECR image URI must be provided

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
    "ecs_service_arn": "arn:aws:ecs:us-east-1:123456789012:service/elizaos-cluster/my-agent",
    "ecs_task_definition_arn": "arn:aws:ecs:us-east-1:123456789012:task-definition/elizaos-my-agent:1",
    "load_balancer_url": "http://my-agent-alb-123456.us-east-1.elb.amazonaws.com",
    "port": 3000,
    "desired_count": 1,
    "cpu": 256,
    "memory": 512,
    "environment_vars": { ... },
    "last_deployed_at": "2025-10-12T10:00:00.000Z",
    "last_health_check": "2025-10-12T10:05:00.000Z",
    "deployment_log": "Deployed successfully to ECS...",
    "error_message": null,
    "created_at": "2025-10-12T09:30:00.000Z"
  }
}
```

---

### Delete Container

`DELETE /api/v1/containers/{id}`

Stop and delete a container from ECS.

**Response:**

```json
{
  "success": true,
  "message": "Container deleted successfully"
}
```

---

### Get ECR Credentials

`POST /api/v1/containers/credentials`

Request ECR repository and authentication token for building and pushing Docker images.

**Rate Limit:** 10 requests per minute

**Request Body:**

```json
{
  "projectId": "my-project",
  "version": "1.0.0",
  "metadata": {
    "elizaVersion": "2.0.0",
    "nodeVersion": "v20.0.0"
  }
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "ecrRepositoryUri": "123456789012.dkr.ecr.us-east-1.amazonaws.com/elizaos/my-org/my-project",
    "ecrImageUri": "123456789012.dkr.ecr.us-east-1.amazonaws.com/elizaos/my-org/my-project:1.0.0-1234567890",
    "ecrImageTag": "1.0.0-1234567890",
    "authToken": "base64-encoded-token",
    "authTokenExpiresAt": "2025-10-12T22:00:00.000Z",
    "registryEndpoint": "https://123456789012.dkr.ecr.us-east-1.amazonaws.com"
  }
}
```

**Usage with Docker:**

```bash
# Decode and login to ECR
echo $AUTH_TOKEN | base64 --decode | docker login -u AWS --password-stdin $REGISTRY_ENDPOINT

# Tag your image
docker tag my-project:latest $ECR_IMAGE_URI

# Push to ECR
docker push $ECR_IMAGE_URI
```

---

### Get Container Quota

`GET /api/v1/containers/quota`

Get quota information and pricing for your organization.

**Response:**

```json
{
  "success": true,
  "data": {
    "quota": {
      "max": 5,
      "current": 2,
      "remaining": 3
    },
    "credits": {
      "balance": 10000
    },
    "pricing": {
      "totalForNewContainer": 1000,
      "containerDeployment": 1000
    }
  }
}
```

---

## API Keys

### List API Keys

`GET /api/v1/api-keys`

Get all API keys for your organization.

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Production Key",
      "key_preview": "eliza_***************xyz",
      "last_used_at": "2025-10-12T10:00:00.000Z",
      "expires_at": null,
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
  "permissions": ["containers:write"],
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
    "key": "eliza_full_key_shown_once_only",
    "key_preview": "eliza_***************xyz",
    "created_at": "2025-10-12T10:00:00.000Z"
  },
  "warning": "Store this key securely. It will not be shown again."
}
```

---

### Delete API Key

`DELETE /api/v1/api-keys/{id}`

Revoke and delete an API key.

**Response:**

```json
{
  "success": true,
  "message": "API key deleted successfully"
}
```

---

## User & Organization

### Get Current User

`GET /api/v1/user`

Get information about the authenticated user.

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "organization_id": "org-uuid",
    "created_at": "2025-09-01T00:00:00.000Z"
  }
}
```

---

## Error Codes

| Code                     | Status | Description                       |
| ------------------------ | ------ | --------------------------------- |
| `UNAUTHORIZED`           | 401    | Missing or invalid API key        |
| `FORBIDDEN`              | 403    | Access denied                     |
| `NOT_FOUND`              | 404    | Resource not found                |
| `VALIDATION_ERROR`       | 400    | Invalid request data              |
| `QUOTA_EXCEEDED`         | 403    | Container limit reached           |
| `INSUFFICIENT_CREDITS`   | 402    | Not enough credits                |
| `RATE_LIMIT_EXCEEDED`    | 429    | Too many requests                 |
| `AWS_API_ERROR`          | 502    | AWS API failure                   |
| `DEPLOYMENT_FAILED`      | 500    | Container deployment failed       |
| `TIMEOUT`                | 504    | Operation timed out               |

---

## Usage Examples

### Deploy via CLI

```bash
# Set your API key
export ELIZAOS_API_KEY="eliza_your_api_key_here"

# Deploy your project
elizaos deploy --name my-agent --port 3000
```

### Deploy via API (Full Flow)

```bash
# 1. Request ECR credentials
curl -X POST "$BASE_URL/api/v1/containers/credentials" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "my-project",
    "version": "1.0.0"
  }'

# 2. Build and push Docker image to ECR
docker build -t my-project:1.0.0 .
docker tag my-project:1.0.0 $ECR_IMAGE_URI
echo $AUTH_TOKEN | base64 --decode | docker login -u AWS --password-stdin $REGISTRY_ENDPOINT
docker push $ECR_IMAGE_URI

# 3. Create container
curl -X POST "$BASE_URL/api/v1/containers" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-agent",
    "port": 3000,
    "desired_count": 1,
    "cpu": 256,
    "memory": 512,
    "ecr_image_uri": "'$ECR_IMAGE_URI'",
    "environment_vars": {
      "NODE_ENV": "production"
    }
  }'

# 4. Check deployment status
curl -X GET "$BASE_URL/api/v1/containers/$CONTAINER_ID" \
  -H "Authorization: Bearer $API_KEY"
```

---

## SDK Examples

### TypeScript/JavaScript

```typescript
import { CloudApiClient } from '@elizaos/api-client';

const client = new CloudApiClient({
  apiKey: process.env.ELIZAOS_API_KEY,
  apiUrl: 'https://elizacloud.ai'
});

// Request ECR credentials
const credentials = await client.requestImageBuild({
  projectId: 'my-project',
  version: '1.0.0'
});

// Create container
const container = await client.createContainer({
  name: 'my-agent',
  ecr_image_uri: credentials.ecrImageUri,
  port: 3000,
  desired_count: 1,
  cpu: 256,
  memory: 512
});

// Wait for deployment
const deployment = await client.waitForDeployment(container.id);
console.log(`Deployed to: ${deployment.load_balancer_url}`);
```

---

## Best Practices

1. **Use API Keys for Automation**: Create dedicated API keys for CI/CD with scoped permissions
2. **Set Expiration Dates**: Configure expiration dates for temporary keys
3. **Monitor Credits**: Set up alerts for low credit balance
4. **Use Health Checks**: Implement `/health` endpoints in your containers
5. **Environment Variables**: Never hardcode secrets - use environment variables
6. **Resource Sizing**: Start with minimum resources and scale up as needed
7. **Multiple Instances**: Use `desired_count > 1` for high availability

---

## Support

For issues or questions:
- Documentation: https://elizacloud.ai/docs
- Support: support@elizacloud.ai
- Status Page: https://status.elizacloud.ai

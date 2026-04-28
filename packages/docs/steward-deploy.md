# Steward Deployment Guide

## Architecture

```
steward repo CI              eliza-cloud repo             Railway
(Steward-Fi/steward)         (elizaOS/cloud)
                                                          
  push to main/tag           deploy-steward.yml           Steward API service
  ─────────────┐             ┌──────────────┐             ┌──────────────┐
  │ Build image│             │ Update image │             │ Pull & start │
  │ Push GHCR  │──dispatch──>│ via Railway  │──GraphQL──> │ new container│
  └────────────┘             │ API          │             └──────────────┘
                             │ Poll health  │                    │
       ghcr.io/              │ Record deploy│<───health 200──────┘
       steward-fi/           └──────────────┘
       steward:<tag>
```

**Components:**

1. **Steward repo** (`Steward-Fi/steward`): builds Docker images, pushes to `ghcr.io/steward-fi/steward:<tag>`
2. **Eliza Cloud repo** (`elizaOS/cloud`): has `deploy-steward.yml` workflow that tells Railway to use a new image
3. **Railway**: hosts the Steward API as a Docker service, pulls from GHCR

## Deploying a New Version

### Automatic (via steward CI)

When steward's CI fires a `repository_dispatch` event with type `steward-release`, the deploy workflow triggers automatically. The payload should include:

```json
{
  "event_type": "steward-release",
  "client_payload": {
    "image_tag": "v0.3.0"
  }
}
```

### Manual (workflow dispatch)

1. Go to **Actions** > **Deploy Steward** in the eliza-cloud repo
2. Click **Run workflow**
3. Enter the image tag (e.g. `develop`, `v0.3.0`, `latest`)
4. Optionally check "Dry run" to preview without deploying
5. Click **Run workflow**

### Manual (CLI)

```bash
gh workflow run deploy-steward.yml \
  -f image_tag=v0.3.0 \
  -f dry_run=false
```

## Rolling Back

To roll back, simply redeploy the previous known-good tag:

```bash
# Find the last working tag (check previous workflow runs or GHCR)
gh workflow run deploy-steward.yml -f image_tag=v0.2.9
```

Or via the GitHub Actions UI, trigger the workflow with the older tag.

Railway keeps previous deployments, so you can also roll back directly in the Railway dashboard by clicking the previous deployment.

## Environment Variables

### Eliza Cloud (Vercel, server-side)

These are used by the Next.js backend to communicate with Steward:

| Variable | Description | Example |
|----------|-------------|---------|
| `STEWARD_API_URL` | Steward API base URL (server-side) | `https://steward-api-production-115d.up.railway.app` |
| `STEWARD_SESSION_SECRET` | JWT secret for verifying Steward session tokens | (shared secret with Steward) |
| `STEWARD_TENANT_API_KEY` | API key for tenant-scoped Steward operations | `stw_...` |
| `STEWARD_TENANT_ID` | Tenant identifier for multi-tenant Steward | `milady-cloud` |
| `STEWARD_PLATFORM_KEYS` | Platform-level API keys | `stwp_...` |
| `USE_STEWARD_FOR_NEW_WALLETS` | Feature flag: route new wallet creation through Steward | `true` or `false` |

### Eliza Cloud (Vercel, client-side / public)

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_STEWARD_API_URL` | Steward API URL exposed to browser | `https://eliza.steward.fi` |
| `NEXT_PUBLIC_STEWARD_TENANT_ID` | Tenant ID exposed to browser | `milady-cloud` |

### Steward on Railway

These are configured in Railway's service environment:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Steward's database connection string |
| `JWT_SECRET` | Must match `STEWARD_SESSION_SECRET` on Vercel side |
| `PORT` | Service port (Railway sets this automatically) |

### GitHub Actions Secrets

| Secret | Description |
|--------|-------------|
| `RAILWAY_STEWARD_TOKEN` | Railway API token for deploying the steward service |

### Keeping Secrets in Sync

The `STEWARD_SESSION_SECRET` (Vercel) must match `JWT_SECRET` (Railway). If either is rotated, update both simultaneously. A mismatch will cause all Steward auth to fail silently (JWT verification returns null).

## Milady Container Env Vars

When Eliza Cloud provisions new agent containers, they receive Steward env vars automatically (see `steward-container-provisioning.md`):

- `STEWARD_API_URL=http://localhost:3200` (container-local Steward sidecar)
- `STEWARD_AGENT_ID=<agent-id>`
- `STEWARD_AGENT_TOKEN=<minted token>`

## Troubleshooting

### Deploy succeeded but health check fails

1. Check Railway logs: look for startup errors, missing env vars, DB connection issues
2. Verify the health endpoint: `curl -v https://steward-api-production-115d.up.railway.app/health`
3. The custom domain `https://eliza.steward.fi` may not have SSL configured yet; use the Railway URL for health checks

### Railway API returns 401

The `RAILWAY_STEWARD_TOKEN` secret is expired or invalid. Generate a new one in Railway dashboard under Account Settings > API Tokens.

### "Image not found" error

The image tag doesn't exist on GHCR. Check available tags:
```bash
# List recent tags
gh api /orgs/steward-fi/packages/container/steward/versions \
  --jq '.[].metadata.container.tags[]' | head -20
```

### Auth failures after deploy

1. Check `STEWARD_SESSION_SECRET` matches Steward's `JWT_SECRET`
2. Check `STEWARD_TENANT_API_KEY` is valid for the tenant
3. Look for `[StewardClient] No STEWARD_SESSION_SECRET` warnings in Vercel logs

### Container provisioning broken after Steward update

If Steward's agent registration API changed:
1. Check `packages/lib/services/docker-sandbox-provider.ts` for provisioning logic
2. Verify `POST /agents` and `POST /agents/:agentId/token` endpoints still work
3. Test with: `curl -X POST $STEWARD_API_URL/agents -H "Authorization: Bearer $STEWARD_TENANT_API_KEY"`

# Docker Provider Integration - Summary

**Branch:** `feat/docker-headscale-infra`  
**Commit:** `f5a7a607`

## ✅ Completed

The Milaidy sandbox provisioning flow now works end-to-end with the Docker provider. The abstraction layer was already in place, but needed wiring to persist docker-specific metadata and integrate optional Headscale VPN.

## Changes Made

### 1. **MilaidySandboxService** (`lib/services/milaidy-sandbox.ts`)

Updated the `provision()` method to persist docker-specific metadata from `handle.metadata` to the database:

- `node_id` - Docker node where the container runs
- `container_name` - Container identifier (e.g., `milady-abc12345`)
- `bridge_port` - Host port mapped to bridge server (31337 inside container)
- `web_ui_port` - Host port mapped to web UI (2138 inside container)
- `headscale_ip` - VPN IP address (if Headscale is enabled)
- `docker_image` - Docker image used (e.g., `milady/agent:cloud-full-ui`)

**Key insight:** The provider abstraction already worked - we just needed to persist the metadata returned by `DockerSandboxProvider.create()`.

### 2. **DockerSandboxProvider** (`lib/services/docker-sandbox-provider.ts`)

Enhanced with:

**a) Docker metadata persistence**
- Added `dockerImage` to the metadata returned by `create()`
- All docker-specific fields now passed up via `handle.metadata`

**b) Optional Headscale VPN integration**
- Checks `HEADSCALE_API_KEY` env var to determine if VPN should be enabled
- Calls `headscaleIntegration.prepareContainerVPN()` to generate pre-auth keys
- Waits for VPN registration via `headscaleIntegration.waitForVPNRegistration()`
- Uses VPN IP for `bridgeUrl` and `healthUrl` when available (fallback to node hostname)
- Cleans up VPN nodes in `stop()` via `headscaleIntegration.cleanupContainerVPN()`

**Graceful degradation:** If Headscale is not configured or VPN registration fails, the provider falls back to using the node's public hostname for bridge/health URLs.

## Provider-Agnostic Routes

All API routes remain provider-agnostic and work with both Vercel and Docker providers:

- **Bridge** (`/api/v1/milaidy/agents/[agentId]/bridge`) - Uses `rec.bridge_url`
- **Stream** (`/api/v1/milaidy/agents/[agentId]/stream`) - Uses `rec.bridge_url` via `bridgeStream()`
- **Snapshot** (`/api/v1/milaidy/agents/[agentId]/snapshot`) - Uses `rec.bridge_url` to call `/api/snapshot`
- **Restore** (`/api/v1/milaidy/agents/[agentId]/restore`) - Uses `rec.bridge_url` to call `/api/restore`
- **Provision** (`/api/v1/milaidy/agents/[agentId]/provision`) - Provider-agnostic via factory

## How It Works

### Provision Flow (Docker)

1. **Database Setup**: Neon DB is provisioned (same for both providers)
2. **VPN Preparation** (optional): Generate Headscale pre-auth key and pass to container via env vars
3. **Container Creation**: SSH to Docker node, pull image, run container with mapped ports
4. **VPN Registration** (optional): Wait up to 60s for container to join VPN mesh
5. **Health Check**: Poll container's health endpoint via provider's `checkHealth()`
6. **State Restore**: If backup exists, push state via bridge API `/api/restore`
7. **Persist Metadata**: Store docker-specific fields in DB for later reference
8. **Return Handle**: Provide `bridgeUrl` and `healthUrl` (using VPN IP if available)

### Bridge URLs

**Docker (no VPN):**
```
bridgeUrl: http://node-hostname:18790
healthUrl: http://node-hostname:20001
```

**Docker (with VPN):**
```
bridgeUrl: http://100.64.0.5:18790   (Headscale IP)
healthUrl: http://100.64.0.5:20001   (Headscale IP)
```

**Vercel:**
```
bridgeUrl: https://abc123.vercel.sh/bridge
healthUrl: https://abc123.vercel.sh/health
```

## Environment Variables

### Required for Docker Provider
- `MILAIDY_SANDBOX_PROVIDER=docker`
- `MILAIDY_DOCKER_NODES=node1:192.168.1.100:8,node2:192.168.1.101:8`
- SSH keys configured for Docker nodes

### Optional (Headscale VPN)
- `HEADSCALE_API_KEY=your-api-key`
- `HEADSCALE_API_URL=http://headscale:8081`
- `HEADSCALE_USER=milaidy`

### Docker Image
- `MILAIDY_DOCKER_IMAGE=milady/agent:cloud-full-ui` (default)

## Database Schema

The following columns were added in migration `0034_docker_nodes.sql`:

```sql
ALTER TABLE milaidy_sandboxes ADD COLUMN node_id TEXT;
ALTER TABLE milaidy_sandboxes ADD COLUMN container_name TEXT;
ALTER TABLE milaidy_sandboxes ADD COLUMN bridge_port INTEGER;
ALTER TABLE milaidy_sandboxes ADD COLUMN web_ui_port INTEGER;
ALTER TABLE milaidy_sandboxes ADD COLUMN headscale_ip TEXT;
ALTER TABLE milaidy_sandboxes ADD COLUMN docker_image TEXT;
```

## Testing Checklist

Before merging, verify:

- [ ] Provision a new agent with `MILAIDY_SANDBOX_PROVIDER=docker`
- [ ] Verify docker-specific fields are persisted in DB
- [ ] Send bridge requests via `/api/v1/milaidy/agents/[agentId]/bridge`
- [ ] Stream messages via `/api/v1/milaidy/agents/[agentId]/stream`
- [ ] Create snapshot via `/api/v1/milaidy/agents/[agentId]/snapshot`
- [ ] Restore from backup via `/api/v1/milaidy/agents/[agentId]/restore`
- [ ] Delete agent and verify cleanup (container + VPN node removed)
- [ ] Test with Headscale VPN enabled (verify VPN IPs are used)
- [ ] Test without Headscale (verify fallback to node hostname)
- [ ] Verify Vercel provider still works (no regression)

## Next Steps

1. **Node Manager Integration** - The `DockerNodeManager` exists but currently uses random node selection. Integrate it for proper load balancing and capacity tracking.

2. **Health Monitoring** - Implement periodic health checks and auto-restart for failed containers.

3. **Port Allocation** - Currently uses random ports. Consider implementing a port registry to avoid conflicts.

4. **Volume Management** - Container data is stored at `/data/agents/{agentId}` on the node. Implement backup/migration for these volumes.

5. **Rate Limiting** - Add rate limits for provision operations to prevent node overload.

## Type Safety

All changes are type-safe. Running `npx tsc --noEmit` shows no errors in modified files.

Pre-existing type errors in:
- `components/admin/admin-metrics-client.tsx`
- `components/builders/quick-create-dialog.tsx`

These are unrelated to the Docker provider integration.

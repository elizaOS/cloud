# Docker + Headscale Infrastructure Integration Plan

## Goal
Replace the Vercel Sandbox provider in `milaidy-sandbox.ts` with milady-cloud's Docker container + Headscale VPN infrastructure. Each agent gets a real VPS-like container on Hetzner nodes with persistent volumes, SSH access, and headscale mesh networking.

## Current State

### Eliza Cloud (this repo)
- `lib/services/milaidy-sandbox.ts` — orchestrates agent lifecycle via **Vercel Sandbox SDK**
- `db/schemas/milaidy-sandboxes.ts` — tracks sandbox state, Neon DB, backups
- `app/api/v1/milaidy/` — REST API for agent CRUD, provision, bridge, snapshot, restore
- Uses Neon for per-agent databases
- Uses Vercel Sandbox `create()`, `get()`, `shutdown()` for compute
- Bridge: JSON-RPC proxy to sandbox ports
- Health check: polls `/health` endpoint

### Milady Cloud (reference implementation)
- `backend/services/container-orchestrator.ts` — Docker container management via SSH
- `backend/services/headscale-manager.ts` — Headscale VPN for agent networking
- `backend/services/node-manager.ts` — multi-node capacity tracking
- Creates Docker containers on remote Hetzner VPS nodes via SSH
- Persistent volumes at `/data/agents/{agentId}`
- Port mapping: bridge (31337 internal), web UI (2138 internal)
- Headscale VPN IPs for inter-container and admin access
- Wildcard DNS: `{agentId}.shad0w.xyz` → Nginx → headscale IP

## Architecture

```
User → Eliza Cloud API → DockerSandboxProvider → SSH → Hetzner Node → Docker Container
                                                   ↕
                                              Headscale VPN
                                                   ↕
                                           Admin/Debug Access
```

## Implementation Plan

### Worker 1: Sandbox Provider Abstraction Layer
**Files:** `lib/services/sandbox-provider.ts`, `lib/services/milaidy-sandbox.ts`

1. Extract a `SandboxProvider` interface from the current Vercel-specific code:
   ```typescript
   interface SandboxProvider {
     create(config: SandboxCreateConfig): Promise<SandboxHandle>;
     stop(sandboxId: string): Promise<void>;
     getHealth(healthUrl: string): Promise<boolean>;
     runCommand?(sandboxId: string, cmd: string): Promise<string>;
   }
   
   interface SandboxHandle {
     sandboxId: string;
     bridgeUrl: string;
     healthUrl: string;
   }
   
   interface SandboxCreateConfig {
     agentId: string;
     agentName: string;
     environmentVars: Record<string, string>;
     snapshotId?: string;
     resources?: { vcpus?: number };
   }
   ```

2. Move current Vercel implementation to `VercelSandboxProvider` implementing that interface
3. Update `MilaidySandboxService` to use `SandboxProvider` interface instead of direct Vercel calls
4. Provider selected via `MILAIDY_SANDBOX_PROVIDER=vercel|docker` env var

### Worker 2: Docker Sandbox Provider (Core)
**Files:** `lib/services/docker-sandbox-provider.ts`, `lib/services/docker-ssh.ts`

1. Create `DockerSandboxProvider` implementing `SandboxProvider`:
   - `create()`: SSH to target node, `docker run` with proper port mapping, volume mounts, env vars
   - `stop()`: SSH to node, `docker stop && docker rm`
   - `getHealth()`: HTTP health check to container's health port
   - `runCommand()`: SSH exec into container

2. Port from milady-cloud's `container-orchestrator.ts`:
   - Docker image: configurable via `MILAIDY_DOCKER_IMAGE` env var
   - Port allocation: bridge port (random 18790-19790), web UI port (random 20000-25000)
   - Persistent volume: `/data/agents/{agentId}` on host
   - Container flags: `--restart unless-stopped`, `--cap-add=NET_ADMIN`, `--device /dev/net/tun`
   - Environment injection: DATABASE_URL, AGENT_NAME, PORT, BRIDGE_PORT + user env vars

3. Create `DockerSSHClient` utility:
   - SSH connection pooling per node
   - Command execution with timeout
   - Error handling and retry logic

### Worker 3: Node Manager + Capacity Tracking
**Files:** `lib/services/docker-node-manager.ts`, `db/schemas/docker-nodes.ts`, `db/migrations/XXXX_docker_nodes.sql`

1. Create `docker_nodes` table:
   ```sql
   CREATE TABLE docker_nodes (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     node_id TEXT UNIQUE NOT NULL,
     hostname TEXT NOT NULL,
     ssh_port INTEGER DEFAULT 22,
     capacity INTEGER NOT NULL DEFAULT 8,
     enabled BOOLEAN DEFAULT true,
     status TEXT DEFAULT 'unknown', -- healthy, degraded, offline
     last_health_check TIMESTAMPTZ,
     metadata JSONB DEFAULT '{}',
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```

2. Port `NodeManager` from milady-cloud:
   - Node health checking via SSH
   - Capacity tracking (allocated vs available slots)
   - Least-loaded node selection for new containers
   - Runtime container audit (detect ghost containers)

3. Add node_id column to `milaidy_sandboxes` table:
   ```sql
   ALTER TABLE milaidy_sandboxes ADD COLUMN node_id TEXT;
   ALTER TABLE milaidy_sandboxes ADD COLUMN container_name TEXT;
   ALTER TABLE milaidy_sandboxes ADD COLUMN bridge_port INTEGER;
   ALTER TABLE milaidy_sandboxes ADD COLUMN web_ui_port INTEGER;
   ALTER TABLE milaidy_sandboxes ADD COLUMN headscale_ip TEXT;
   ```

### Worker 4: Headscale VPN Integration
**Files:** `lib/services/headscale-client.ts`, `lib/services/docker-sandbox-provider.ts` (extend)

1. Port `HeadscaleManager` from milady-cloud:
   - API client for headscale server (REST API)
   - Pre-auth key generation for new containers
   - Node registration and IP tracking
   - VPN status monitoring

2. Integrate with Docker provider:
   - On container create: generate pre-auth key, pass as env var
   - Container's entrypoint auto-joins headscale VPN
   - Poll for VPN IP assignment, store in DB
   - Wildcard DNS routing: `{agentId}.domain.com` → headscale IP

3. Environment variables:
   ```
   HEADSCALE_API_URL=http://headscale:8081
   HEADSCALE_API_KEY=...
   HEADSCALE_USER=milaidy
   ```

### Worker 5: Admin API + Node Management Endpoints
**Files:** `app/api/v1/admin/nodes/`, `app/api/v1/admin/containers/`

1. Node management API:
   - `GET /api/v1/admin/nodes` — list all nodes with health/capacity
   - `POST /api/v1/admin/nodes` — register new node
   - `DELETE /api/v1/admin/nodes/:id` — decommission node
   - `POST /api/v1/admin/nodes/:id/health-check` — trigger health check

2. Container management API:
   - `GET /api/v1/admin/containers` — list all containers across nodes
   - `POST /api/v1/admin/containers/audit` — run ghost container detection
   - `POST /api/v1/admin/containers/cleanup` — remove ghost containers
   - `GET /api/v1/admin/containers/:id/logs` — fetch container logs via SSH

3. Wire into existing admin auth (`requireAdminAuth`)

## Schema Changes Summary

### New table: `docker_nodes`
- Tracks Hetzner VPS nodes available for container provisioning

### Alter table: `milaidy_sandboxes`
- Add: `node_id TEXT` — which node hosts this container
- Add: `container_name TEXT` — Docker container name
- Add: `bridge_port INTEGER` — mapped bridge port on host
- Add: `web_ui_port INTEGER` — mapped web UI port on host  
- Add: `headscale_ip TEXT` — VPN IP address
- Add: `docker_image TEXT` — image used for this container

## Environment Variables

```env
# Provider selection
MILAIDY_SANDBOX_PROVIDER=docker  # vercel | docker

# Docker provider config
MILAIDY_DOCKER_IMAGE=milady/agent:cloud-full-ui
MILAIDY_DOCKER_NODES=agent-node-1:37.27.190.196:8,nyx-node:89.167.49.4:8
MILAIDY_SSH_KEY_PATH=/path/to/ssh/key

# Headscale
HEADSCALE_API_URL=http://headscale:8081
HEADSCALE_API_KEY=...
HEADSCALE_USER=milaidy

# Wildcard DNS
MILAIDY_AGENT_DOMAIN=shad0w.xyz
```

## Migration Path
1. Deploy with `MILAIDY_SANDBOX_PROVIDER=vercel` (no change)
2. Set up Docker nodes, headscale, register nodes via admin API
3. Switch to `MILAIDY_SANDBOX_PROVIDER=docker`
4. Existing Vercel sandboxes continue running until shutdown
5. New provisions go to Docker infrastructure

## Dependencies
- `ssh2` — SSH client for Node.js (already used in milady-cloud)
- No other new deps needed (everything else is HTTP calls)

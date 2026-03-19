# Operations Runbook

> Last updated: 2026-03-19

## Table of Contents
- [Deploy New Release (Eliza Cloud)](#deploy-new-release-eliza-cloud)
- [Deploy New Docker Agent Image](#deploy-new-docker-agent-image)
- [Add a New Docker Node](#add-a-new-docker-node)
- [Remove a Docker Node](#remove-a-docker-node)
- [Rotate API Keys / Secrets](#rotate-api-keys--secrets)
- [Debug a Failed Container](#debug-a-failed-container)
- [Scale Up / Down](#scale-up--down)
- [Restart All Services](#restart-all-services)
- [Fix Cloudflare Tunnel Issues](#fix-cloudflare-tunnel-issues)
- [Fix Headscale Issues](#fix-headscale-issues)
- [Database Operations](#database-operations)
- [Emergency Procedures](#emergency-procedures)

---

## Deploy New Release (Eliza Cloud)

**Where:** shad0wbot VPS (188.245.252.86)

```bash
# 1. SSH in
ssh shad0w@188.245.252.86

# 2. Go to project
cd /home/shad0w/projects/eliza-cloud-v2-milady-pack

# 3. Pull latest
git fetch origin main
git pull origin main

# 4. Install deps (if package.json changed)
bun install --frozen-lockfile

# 5. Build
NEXT_DIST_DIR=.next-build bun run build

# 6. Reload (zero-downtime)
pm2 reload eliza-cloud-ui-3000

# 7. Verify
sleep 5
curl -sf http://localhost:3000/api/health
pm2 logs eliza-cloud-ui-3000 --lines 20
```

**If build fails:** Fix the issue locally, push, try again. The old `.next-build` is still running.

**If the app crashes after reload:**
```bash
# Check logs
pm2 logs eliza-cloud-ui-3000 --lines 100

# Rollback to previous commit
git log --oneline -5
git checkout <last-good-commit>
NEXT_DIST_DIR=.next-build bun run build
pm2 reload eliza-cloud-ui-3000
```

---

## Deploy New Docker Agent Image

**Build host:** Any machine with Docker (currently manual on milady VPS)

```bash
# 1. SSH to build host
ssh root@89.167.63.246

# 2. Go to milady repo
cd /home/shad0w/projects/milady  # or wherever the milady repo is
git checkout deploy/vercel-cloud-only
git pull

# 3. Build image
docker build -f deploy/Dockerfile.cloud-full-ui \
  -t 89.167.63.246:5000/milady/agent:cloud-full-ui \
  -t 89.167.63.246:5000/milady/agent:latest \
  .

# 4. Push to registry
docker push 89.167.63.246:5000/milady/agent:cloud-full-ui
docker push 89.167.63.246:5000/milady/agent:latest

# 5. Pre-pull on docker nodes (speeds up container creation)
ssh -i /root/.ssh/clawdnet_nodes root@37.27.190.196 \
  "docker pull 89.167.63.246:5000/milady/agent:cloud-full-ui"

# For nyx-node (if online):
ssh -i /root/.ssh/clawdnet_nodes root@89.167.49.4 \
  "docker pull 89.167.63.246:5000/milady/agent:cloud-full-ui" || echo "nyx-node offline"
```

**Notes:**
- Image is ~7.65 GB. Builds take 10-20 min.
- New containers will use the new image. Existing containers keep their current image.
- To update running containers, they must be stopped and recreated.

---

## Add a New Docker Node

### Prerequisites
- Fresh VPS with Docker installed
- SSH access from milady VPS
- Network connectivity to private registry (89.167.63.246:5000)

### Steps

```bash
# === On the new VPS ===

# 1. Install Docker
curl -fsSL https://get.docker.com | sh

# 2. Configure insecure registry
cat > /etc/docker/daemon.json << 'EOF'
{
  "insecure-registries": ["89.167.63.246:5000"],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "3"
  }
}
EOF
systemctl restart docker

# 3. Pre-pull the agent image
docker pull 89.167.63.246:5000/milady/agent:cloud-full-ui

# 4. Install Tailscale (for Headscale VPN mesh)
curl -fsSL https://tailscale.com/install.sh | sh
# Note: Individual containers join the mesh, not the host itself

# 5. Set up SSH key for milady VPS access
# Copy the public key from milady VPS /root/.ssh/clawdnet_nodes.pub
# to this node's /root/.ssh/authorized_keys


# === On milady VPS (89.167.63.246) ===

# 6. Test SSH connectivity
ssh -i /root/.ssh/clawdnet_nodes root@NEW_NODE_IP "docker info"


# === On shad0wbot VPS (188.245.252.86) ===

# 7. Add to MILADY_DOCKER_NODES env var
# Edit .env.local:
MILADY_DOCKER_NODES="agent-node-1:37.27.190.196:8,nyx-node:89.167.49.4:8,new-node:NEW_NODE_IP:8"

# 8. Register in database
# The Eliza Cloud admin API should pick it up, or insert directly:
psql $DATABASE_URL -c "
INSERT INTO docker_nodes (node_id, hostname, capacity, enabled, status, ssh_user)
VALUES ('new-node-id', 'NEW_NODE_IP', 8, true, 'unknown', 'root');
"

# 9. Restart Eliza Cloud to pick up new node
pm2 reload eliza-cloud-ui-3000

# 10. Verify via admin dashboard or API
curl -s http://localhost:3000/api/admin/infrastructure | jq '.nodes'
```

---

## Remove a Docker Node

```bash
# 1. Disable the node (stops new containers from being scheduled)
psql $DATABASE_URL -c "
UPDATE docker_nodes SET enabled = false WHERE node_id = 'node-to-remove';
"

# 2. Migrate running containers (if any)
# Use admin API or manually stop + recreate on another node

# 3. Remove from MILADY_DOCKER_NODES env var
# Edit .env.local and remove the node entry

# 4. Reload Eliza Cloud
pm2 reload eliza-cloud-ui-3000

# 5. (Optional) Clean up the VPS
ssh root@NODE_IP "docker system prune -af"
```

---

## Rotate API Keys / Secrets

### Database URL (Neon)
1. Generate new password in Neon console
2. Update `DATABASE_URL` in `.env.local` on shad0wbot VPS
3. Update GitHub secret `DATABASE_URL`
4. `pm2 reload eliza-cloud-ui-3000`

### Headscale API Key
```bash
# On milady VPS, generate new key via Headscale CLI
headscale apikeys create --expiration 365d

# Update in .env.local on shad0wbot VPS:
HEADSCALE_API_KEY=new-key-here

# Reload
pm2 reload eliza-cloud-ui-3000
```

### Privy Secrets
1. Rotate in Privy dashboard (privy.io)
2. Update `PRIVY_APP_SECRET` in `.env.local`
3. `pm2 reload eliza-cloud-ui-3000`

### Stripe Keys
1. Roll keys in Stripe dashboard
2. Update `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` in `.env.local`
3. `pm2 reload eliza-cloud-ui-3000`
4. Update webhook endpoint in Stripe to use new signing secret

### Cloudflare Tunnel Credentials
```bash
# Rare — only if tunnel is compromised
cloudflared tunnel delete OLD_TUNNEL
cloudflared tunnel create NEW_TUNNEL
# Update ~/.cloudflared/config.yml with new tunnel ID
# Update DNS CNAME records to point to new tunnel
pm2 restart cloudflared
```

---

## Debug a Failed Container

### Step 1: Identify the container
```bash
# Check milady_sandboxes table
psql $DATABASE_URL -c "
SELECT id, agent_id, status, node_id, headscale_ip, error_message, updated_at
FROM milady_sandboxes
WHERE status IN ('failed', 'error', 'stopped')
ORDER BY updated_at DESC
LIMIT 10;
"
```

### Step 2: Check container on docker node
```bash
# SSH to the docker node (via milady VPS)
ssh root@89.167.63.246
ssh -i /root/.ssh/clawdnet_nodes root@DOCKER_NODE_IP

# List containers
docker ps -a --filter "name=AGENT_ID_PREFIX"

# Check logs
docker logs CONTAINER_NAME --tail 100

# Check resource usage
docker stats CONTAINER_NAME --no-stream
```

### Step 3: Common issues

**Container won't start:**
- Check image exists: `docker images | grep milady`
- Check disk space: `df -h`
- Check memory: `free -h`
- Check Docker logs: `journalctl -u docker --since "1 hour ago"`

**Container starts but no VPN:**
- Check Headscale is reachable: `curl http://89.167.63.246:8081/health`
- Check pre-auth key wasn't expired
- Inside container: `tailscale status` (if you can exec in)

**Container healthy but not accessible via subdomain:**
- Check milady_sandboxes has correct headscale_ip
- Check nginx can reach the IP: `curl http://HEADSCALE_IP:WEB_UI_PORT/health` from milady VPS
- Check nginx error logs: `tail -f /var/log/nginx/error.log` on milady VPS
- Check agent-lookup bridge: `curl http://localhost:3456/agents/AGENT_ID/headscale-ip` on milady VPS

### Step 4: Force restart a container
```bash
# On the docker node
docker restart CONTAINER_NAME

# Or remove and let the system recreate
docker stop CONTAINER_NAME && docker rm CONTAINER_NAME
# Then trigger reprovisioning via Eliza Cloud admin API
```

---

## Scale Up / Down

### Scale Up: Add Capacity
1. **Add a new docker node** (see above)
2. **Increase capacity on existing node:**
   ```sql
   UPDATE docker_nodes SET capacity = 12 WHERE node_id = 'agent-node-1';
   ```
   (Ensure the VPS has enough RAM/CPU — roughly 1-2 GB per container)

### Scale Down: Reduce Capacity
1. **Disable a node:** `UPDATE docker_nodes SET enabled = false WHERE node_id = 'node-id';`
2. **Reduce capacity:** `UPDATE docker_nodes SET capacity = 4 WHERE node_id = 'node-id';`
3. Existing containers above capacity will continue running but no new ones scheduled

### Monitor Capacity
```sql
SELECT
  node_id,
  hostname,
  capacity,
  allocated_count,
  capacity - allocated_count AS available,
  status,
  enabled
FROM docker_nodes
ORDER BY available DESC;
```

---

## Restart All Services

```bash
# On shad0wbot VPS (188.245.252.86)
pm2 restart all

# Or selectively:
pm2 restart eliza-cloud-ui-3000
pm2 restart cloudflared
pm2 restart cloudflared-milady-api
pm2 restart milady-discord-bot
pm2 restart homepage-3003

# Save PM2 state (survives reboots)
pm2 save
```

---

## Fix Cloudflare Tunnel Issues

### Symptoms: `*.shad0w.xyz` or `milady-api.*` unreachable

```bash
# Check tunnel status
pm2 status cloudflared
pm2 status cloudflared-milady-api

# Check logs for errors
pm2 logs cloudflared --lines 50
pm2 logs cloudflared-milady-api --lines 50

# Common: tunnel lost connection
pm2 restart cloudflared
pm2 restart cloudflared-milady-api

# Verify tunnel is connected
cloudflared tunnel info 09526176-df95-4205-8e4b-621b0feb7228
cloudflared tunnel info 08a2da3d-4882-479d-82df-eb886603447c
```

---

## Fix Headscale Issues

### Symptoms: New containers can't join VPN, agent subdomains unreachable

```bash
# Check Headscale health (from milady VPS)
curl http://localhost:8081/health

# List registered nodes
curl -s http://localhost:8081/api/v1/node \
  -H "Authorization: Bearer $HEADSCALE_API_KEY" | jq '.nodes[] | {name, online, ipAddresses}'

# Check if specific agent is registered
curl -s http://localhost:8081/api/v1/node \
  -H "Authorization: Bearer $HEADSCALE_API_KEY" | jq '.nodes[] | select(.name | contains("AGENT_ID"))'

# Restart Headscale (on milady VPS)
sudo systemctl restart headscale
```

---

## Database Operations

### Check database connectivity
```bash
psql $DATABASE_URL -c "SELECT 1;"
```

### Check active containers
```sql
SELECT COUNT(*), status FROM milady_sandboxes GROUP BY status;
```

### Check node health
```sql
SELECT node_id, hostname, status, allocated_count, capacity, last_health_check
FROM docker_nodes;
```

### Clear stuck provisioning jobs
```sql
-- Find stuck jobs
SELECT * FROM milady_sandboxes WHERE status = 'provisioning' AND updated_at < NOW() - INTERVAL '15 minutes';

-- Mark as failed
UPDATE milady_sandboxes SET status = 'failed', error_message = 'Provisioning timed out (manual cleanup)'
WHERE status = 'provisioning' AND updated_at < NOW() - INTERVAL '15 minutes';
```

---

## Emergency Procedures

### Everything is down
```bash
# 1. Check if VPS is reachable
ping 188.245.252.86

# 2. SSH in
ssh shad0w@188.245.252.86

# 3. Check PM2
pm2 list

# 4. Restart everything
pm2 restart all

# 5. Check each service
curl http://localhost:3000/api/health    # Eliza Cloud
curl http://localhost:3003/              # Homepage
```

### Database is unreachable
1. Check Neon dashboard (https://console.neon.tech)
2. Neon has auto-suspend — the DB may need a wake-up request
3. Verify connection string in `.env.local` is correct
4. Check if the VPS can reach Neon: `psql $DATABASE_URL -c "SELECT 1;"`

### VPS ran out of disk
```bash
# Check disk usage
df -h

# PM2 logs can grow large
du -sh ~/.pm2/logs/
pm2 flush  # Clear all PM2 logs

# Docker can accumulate images
docker system prune -af  # On docker nodes

# Node modules
du -sh /home/shad0w/projects/*/node_modules/ | sort -h | tail -10
```

### VPS ran out of memory
```bash
# Check memory
free -h

# Check what's using memory
pm2 monit  # Interactive monitor

# Restart the heaviest process (usually Eliza Cloud)
pm2 restart eliza-cloud-ui-3000
```

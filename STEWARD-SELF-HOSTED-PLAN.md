# Steward Self-Hosted: Production Readiness Plan

## Current State

**What works:**
- Steward docker service in docker-compose.yml (builds from sibling `../steward` repo)
- DB init script creates `steward` database in shared postgres
- Environment variables configured for all auth methods
- Tenant provisioning API (`POST /api/v1/steward/tenants`)
- Wallet provider flags (`USE_STEWARD_FOR_NEW_WALLETS`, `ALLOW_PRIVY_MIGRATION`, `DISABLE_PRIVY_WALLETS`)
- Agent-server-wallets schema with `provider: 'privy' | 'steward'` column
- Organizations schema with `steward_tenant_id` + `steward_tenant_api_key`

**What's missing for production:**

### 1. Auto-Migration on Startup
- Steward needs `SKIP_MIGRATIONS=true` or proper drizzle migration tracking
- The docker-compose DB is fresh, so migrations should run on first boot
- **Fix:** Remove SKIP_MIGRATIONS from docker env (let migrations run naturally for fresh DBs)
- **Effort:** Small (env var change)

### 2. Redis for Token/Challenge Stores
- Steward falls back to in-memory when Redis isn't available
- Docker-compose doesn't include Redis for steward (uses eliza-cloud's Redis)
- **Fix:** Add `REDIS_URL=redis://redis:6379` to steward service env in docker-compose
- **Effort:** Small (1 line)

### 3. Tenant Auto-Provisioning
- Currently: manual script (`provision-waifu-tenant.ts`) or API call
- Should: auto-create steward tenant when new eliza-cloud org is created
- **Fix:** Wire into org creation flow in `packages/lib/services/organizations.ts`
- **Effort:** Medium (needs to call steward API, store tenant ID + key)

### 4. Wallet Routing
- `wallet-provider-flags.ts` already has the flags
- `server-wallets.ts` and `wallet-provider.ts` already have routing logic
- Just needs `USE_STEWARD_FOR_NEW_WALLETS=true` in env
- **Effort:** Small (env var)

### 5. Steward Image Source
**Current:** Builds from `../steward` sibling directory (breaks if repo not cloned)
**Options:**
- **A: GHCR image (recommended)** — `image: ghcr.io/steward-fi/steward:latest` instead of build context. No sibling repo needed. We already have the Docker workflow ready.
- **B: Git submodule** — `git submodule add` steward into eliza cloud. Keeps in sync but adds complexity.
- **C: Keep sibling build** — Developer clones both repos. Simple but fragile.

**Recommendation:** Option A (GHCR). Change docker-compose to use published image with build-from-source as fallback:
```yaml
steward:
  image: ghcr.io/steward-fi/steward:latest
  # Or build from source if available:
  # build:
  #   context: ../steward
  #   dockerfile: Dockerfile
```

### 6. Health Check + Depends On
- Already configured in docker-compose ✅
- Steward depends on postgres ✅
- Health check: `curl -sf http://localhost:3200/health` ✅

### 7. Secret Management
- Master password: currently `dev-master-password-change-in-prod` default
- **Fix:** Add documentation requiring production users to set `STEWARD_MASTER_PASSWORD` to a strong random value
- **Fix:** Add startup check that refuses to start with the default dev password in production
- **Effort:** Small

### 8. Backup Strategy
- Steward's encrypted keys are in the postgres `steward` database
- Since it shares the postgres container with eliza cloud, same backup strategy applies
- **Document:** If steward DB is lost, all agent wallet keys are lost (they're encrypted with master password)
- **Effort:** Documentation only

---

## Recommended Priority Order

1. **Add REDIS_URL to docker-compose steward service** (5 min)
2. **Switch to GHCR image** (needs Docker workflow fix first, then 5 min)
3. **Wire tenant auto-provisioning into org creation** (1 session)
4. **Set USE_STEWARD_FOR_NEW_WALLETS=true** (1 min, after testing)
5. **Document production requirements** (master password, backup, etc.)
6. **User migration script** (1 session)
7. **Remove Privy** (1-2 sessions)

---

## What Goes Upstream to Steward-Fi/steward

- Docker workflow GHCR fix → **upstream**
- Health check improvements → **upstream**
- Startup secret validation → **upstream**
- Any auth bug fixes → **upstream**

## What Stays in Eliza Cloud

- Tenant auto-provisioning (org-specific)
- Wallet provider routing (eliza-cloud-specific)
- User sync (steward-sync.ts)
- Login page integration
- All Privy migration code

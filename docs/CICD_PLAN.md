# CI/CD Plan

> Last updated: 2026-03-19
> Status: Proposed — not yet implemented

## Current State (Problems)

1. **No deployment pipeline** — Eliza Cloud app deployed via manual SSH + `pm2 restart`
2. **No nginx config management** — Agent router config edited directly on milady VPS
3. **Manual Docker image builds** — Agent images built by hand, pushed to private registry
4. **No rollback procedure** — If a deploy breaks, manual `git checkout` + rebuild
5. **Secrets scattered** — `.env.local` files, PM2 env vars, `.bashrc`, no central management
6. **No health monitoring** — Only Vercel cron-based health checks, no alerting
7. **Single point of failure** — shad0wbot VPS handles everything

## Proposed Architecture

```
GitHub (push to main/dev)
    │
    ├── Tests (existing: tests.yml)
    │
    ├── Eliza Cloud App ──────► Build .next-build artifact
    │                           ──► SSH deploy to shad0wbot VPS
    │                           ──► pm2 reload (zero-downtime)
    │
    ├── Agent Docker Image ───► Build image
    │                           ──► Push to GHCR + private registry
    │                           ──► Pre-pull on docker nodes
    │
    ├── nginx Config ─────────► Validate config (nginx -t)
    │                           ──► SSH deploy to milady VPS
    │                           ──► nginx reload
    │
    └── Infra (Terraform) ────► (existing: gateway-discord.yml)
```

## Phase 1: Eliza Cloud App Deployment (Priority: HIGH)

### GitHub Actions Workflow: `deploy-eliza-cloud.yml`

```yaml
name: Deploy Eliza Cloud

on:
  push:
    branches: [main]
    paths:
      - 'app/**'
      - 'packages/**'
      - 'next.config.ts'
      - 'package.json'
  workflow_dispatch:
    inputs:
      environment:
        description: 'Target environment'
        type: choice
        options: [production, staging]
        default: production

concurrency:
  group: deploy-eliza-cloud
  cancel-in-progress: false  # Don't cancel in-flight deploys

env:
  NODE_VERSION: '22'
  BUN_VERSION: '1.3.5'

jobs:
  test:
    uses: ./.github/workflows/tests.yml

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: oven-sh/setup-bun@v2
        with: { bun-version: '${{ env.BUN_VERSION }}' }
      - run: bun install --frozen-lockfile
      - run: bun run build
        env:
          NEXT_DIST_DIR: .next-build
          # All NEXT_PUBLIC_* vars needed at build time
          NEXT_PUBLIC_APP_URL: ${{ vars.NEXT_PUBLIC_APP_URL }}
          NEXT_PUBLIC_PRIVY_APP_ID: ${{ vars.NEXT_PUBLIC_PRIVY_APP_ID }}
          NEXT_PUBLIC_PRIVY_CLIENT_ID: ${{ vars.NEXT_PUBLIC_PRIVY_CLIENT_ID }}
          NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: ${{ vars.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY }}
          NEXT_PUBLIC_POSTHOG_KEY: ${{ vars.NEXT_PUBLIC_POSTHOG_KEY }}
          NEXT_PUBLIC_POSTHOG_HOST: ${{ vars.NEXT_PUBLIC_POSTHOG_HOST }}
      - name: Archive build
        run: tar czf build.tar.gz .next-build node_modules package.json next.config.ts ecosystem.config.js
      - uses: actions/upload-artifact@v4
        with:
          name: eliza-cloud-build
          path: build.tar.gz
          retention-days: 7

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/download-artifact@v4
        with: { name: eliza-cloud-build }
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: 188.245.252.86
          username: shad0w
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            set -e
            cd /home/shad0w/projects/eliza-cloud-v2-milady-pack

            # Backup current build
            [ -d .next-build ] && cp -r .next-build .next-build.bak

            # Pull latest
            git fetch origin main
            git reset --hard origin/main

            # Install deps
            bun install --frozen-lockfile

            # Build
            NEXT_DIST_DIR=.next-build bun run build

            # Reload (zero-downtime with PM2)
            pm2 reload eliza-cloud-ui-3000

            # Health check
            sleep 5
            if ! curl -sf http://localhost:3000/api/health > /dev/null; then
              echo "Health check failed! Rolling back..."
              [ -d .next-build.bak ] && mv .next-build.bak .next-build
              pm2 reload eliza-cloud-ui-3000
              exit 1
            fi

            # Cleanup backup
            rm -rf .next-build.bak
            echo "Deploy successful!"

      - name: Notify on failure
        if: failure()
        run: echo "::error::Deployment failed! Check PM2 logs."
```

### SSH Key Setup
1. Generate deploy key: `ssh-keygen -t ed25519 -f deploy-key -N ""`
2. Add public key to `~/.ssh/authorized_keys` on shad0wbot VPS
3. Add private key as GitHub secret `DEPLOY_SSH_KEY`

---

## Phase 2: Docker Image Pipeline (Priority: HIGH)

### Current: Manual build on VPS → push to `89.167.63.246:5000`
### Target: GitHub Actions → GHCR + pre-pull on nodes

The `milady-cloud-ci/build-cloud-image.yml` workflow is already written. To activate:

1. **Push to milady-ai/milady repo** as `.github/workflows/build-cloud-image.yml`
2. **Add GHCR auth:** Re-auth `gh` with `write:packages` scope
3. **Add node pre-pull step:**

```yaml
  pre-pull:
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - name: Pre-pull on docker nodes
        uses: appleboy/ssh-action@v1
        with:
          host: 89.167.63.246  # milady VPS (jump host)
          username: root
          key: ${{ secrets.MILADY_VPS_SSH_KEY }}
          script: |
            for NODE in 37.27.190.196 89.167.49.4; do
              ssh -i /root/.ssh/clawdnet_nodes -o ConnectTimeout=10 root@$NODE \
                "docker pull 89.167.63.246:5000/milady/agent:cloud-full-ui" \
                || echo "WARN: Failed to pre-pull on $NODE"
            done
```

### Transition Plan (Private Registry → GHCR)
1. Keep private registry running during transition
2. Update `MILADY_DOCKER_IMAGE` env var to GHCR URL
3. Configure docker nodes with GHCR credentials
4. Deprecate private registry after validation

---

## Phase 3: nginx Config Management (Priority: MEDIUM)

### Problem
nginx configs on milady VPS are edited by hand. No version control, no validation, no rollback.

### Solution: Config-as-Code

```yaml
name: Deploy nginx Config

on:
  push:
    branches: [main]
    paths:
      - 'infra/nginx/**'
  workflow_dispatch:

jobs:
  deploy-nginx:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v5

      - name: Validate nginx config
        run: |
          docker run --rm -v $PWD/infra/nginx:/etc/nginx/conf.d:ro \
            nginx:alpine nginx -t

      - name: Deploy to milady VPS
        uses: appleboy/ssh-action@v1
        with:
          host: 89.167.63.246
          username: root
          key: ${{ secrets.MILADY_VPS_SSH_KEY }}
          script: |
            set -e
            # Backup
            cp -r /etc/nginx/conf.d /etc/nginx/conf.d.bak

            # Deploy new configs
            # (rsync or scp from artifact)

            # Validate
            nginx -t || { cp -r /etc/nginx/conf.d.bak /etc/nginx/conf.d; exit 1; }

            # Reload
            systemctl reload nginx

            # Cleanup
            rm -rf /etc/nginx/conf.d.bak
```

### Action Items
1. Copy current nginx configs from milady VPS into `infra/nginx/` in the repo
2. Include `agent-router.lua` and `agents-wildcard` config
3. Set up SSH key for milady VPS in GitHub secrets

---

## Phase 4: Secrets Management (Priority: MEDIUM)

### Current State
- `.env.local` on shad0wbot VPS (checked in `.gitignore`)
- Headscale keys, DB URLs, API keys scattered
- No rotation procedure
- No audit trail

### Recommended: GitHub Environments + Secrets

**Minimum viable approach (no extra tooling):**

1. **GitHub Environments:** `production`, `staging`
2. **GitHub Secrets:** All sensitive values
3. **GitHub Variables:** Non-sensitive config (URLs, feature flags)
4. **Deploy script** writes `.env.local` from GitHub secrets at deploy time

```yaml
- name: Write environment file
  uses: appleboy/ssh-action@v1
  with:
    host: 188.245.252.86
    username: shad0w
    key: ${{ secrets.DEPLOY_SSH_KEY }}
    envs: DATABASE_URL,REDIS_URL,PRIVY_APP_SECRET,...
    script: |
      cat > /home/shad0w/projects/eliza-cloud-v2-milady-pack/.env.local <<EOF
      DATABASE_URL=$DATABASE_URL
      REDIS_URL=$REDIS_URL
      PRIVY_APP_SECRET=$PRIVY_APP_SECRET
      ...
      EOF
```

### Future: Consider
- **1Password Connect** — team already uses 1Password? Integrate via service account
- **Doppler** — free tier, good DX, syncs to GitHub Actions + servers
- **Infisical** — open-source, self-hostable

---

## Phase 5: Config Management (Priority: LOW)

### Skip Ansible/Terraform for VPS management. Use simple shell scripts.

Given the small number of servers (3-5), full config management tooling is overkill. Instead:

```
infra/
├── scripts/
│   ├── setup-docker-node.sh      # Bootstrap new docker node
│   ├── setup-headscale.sh        # Install/configure headscale
│   ├── setup-nginx.sh            # Install nginx + lua module
│   ├── rotate-secrets.sh         # Secret rotation helper
│   └── health-check-all.sh       # Check all services
├── nginx/
│   ├── agents-wildcard.conf
│   ├── agent-router.lua
│   └── api.conf
└── docker/
    ├── daemon.json.template      # Docker node config
    └── registry-compose.yml      # Private registry docker-compose
```

### When to upgrade to Ansible
- More than 5 docker nodes
- Multiple people deploying
- Need to reproduce infrastructure from scratch regularly

---

## Rollback Procedures

### Eliza Cloud App
```bash
# On shad0wbot VPS
cd /home/shad0w/projects/eliza-cloud-v2-milady-pack

# Option 1: Use backup (if deploy script made one)
mv .next-build.bak .next-build
pm2 reload eliza-cloud-ui-3000

# Option 2: Revert git and rebuild
git log --oneline -5  # Find good commit
git checkout <commit>
NEXT_DIST_DIR=.next-build bun run build
pm2 reload eliza-cloud-ui-3000
```

### Docker Agent Image
```bash
# On docker node (via milady VPS)
# List available tags
curl http://89.167.63.246:5000/v2/milady/agent/tags/list

# Running containers will keep their current image
# Only NEW containers use the latest tag
# To rollback: re-tag the old image
docker tag 89.167.63.246:5000/milady/agent:previous-good \
  89.167.63.246:5000/milady/agent:cloud-full-ui
docker push 89.167.63.246:5000/milady/agent:cloud-full-ui
```

### nginx Config
```bash
# On milady VPS
cp -r /etc/nginx/conf.d.bak /etc/nginx/conf.d
nginx -t && systemctl reload nginx
```

---

## Implementation Priority

| Phase | Effort | Impact | Timeline |
|-------|--------|--------|----------|
| **Phase 1: App Deploy** | 2-4 hours | Eliminates manual SSH deploys | Week 1 |
| **Phase 2: Docker Pipeline** | 2-3 hours | Already mostly written | Week 1 |
| **Phase 3: nginx Config** | 3-4 hours | Version-controlled infra | Week 2 |
| **Phase 4: Secrets** | 2-3 hours | Audit trail, rotation | Week 2 |
| **Phase 5: Config Mgmt** | 4-6 hours | Reproducible nodes | Week 3+ |

## Quick Wins (Do Now)

1. **Add deploy SSH key to GitHub secrets** — unlocks all deployment workflows
2. **Push `build-cloud-image.yml` to milady repo** — automated Docker builds
3. **Copy nginx configs into repo** — version control starts immediately
4. **Write `.env.example` with all required vars** — documentation is a form of safety

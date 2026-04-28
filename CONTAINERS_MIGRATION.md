# Containers backend migration — AWS → Hetzner (Milady)

Owner: Containers agent (this worktree). Branch: `shaw/refactor`. Coordinates
with Agent B (Hono port), Agent C (Cloudflare infra), Agent D (Privy →
Steward), Agent G (route conversions).

---

## TL;DR

Cloud has **two parallel container control planes today**:

1. **AWS** (CloudFormation + ECS + ECR + CloudWatch) — drives `/api/v1/containers/*`,
   used by the public Containers product (cli `milady containers create`,
   dashboard "Deploy" button). Synchronous CloudFormation waits up to 13 min.
2. **Hetzner via Docker over SSH** — drives `DockerSandboxProvider`,
   already used by the per-user agent sandbox flow (`milady_sandboxes` +
   `docker_nodes` tables). Mature: connection pooling, host-key pinning,
   node selection, health checks, Headscale VPN, Steward integration.

The "Milady containers" the user is asking about is **already live in this
repo**. It is not in the parent Milady repo — the parent only ships the
client-side agent image (`ghcr.io/milady-ai/agent:*`) and the deploy
toolkit. The control plane is here in `cloud/`.

This migration **deletes the AWS path** and rebuilds `/api/v1/containers/*`
on top of the existing Hetzner-Docker control plane, fronted by a typed
client (`hetzner-client.ts`). The old AWS-shaped DB columns
(`cloudformation_stack_name`, `ecs_*`, `ecr_*`) are retained as nullable
in the schema until a follow-up migration drops them — keeping the deploy
risk-free for in-flight migrations.

---

## A. AWS surface in cloud (audit)

`grep -rn '@aws-sdk' --include='*.ts' --exclude-dir=node_modules .`

| File | Service | Operations | What it does at the business level |
|------|---------|-----------|--------------------------------------|
| `packages/lib/services/cloudformation.ts` | CloudFormation | CreateStack, UpdateStack, DeleteStack, DescribeStacks, DescribeStackEvents | Per-user / per-project EC2+ECS provisioning; ALB priority allocation; long-poll (13 min) for stack completion |
| `packages/lib/services/ecr.ts` | ECR | CreateRepository, GetAuthorizationToken, DescribeRepositories, DescribeImages, BatchDeleteImage, PutLifecyclePolicy | Per-user Docker registry (image upload from CLI), token vending for `docker login`, image-exists verify before deploy |
| `packages/lib/services/secrets/encryption.ts` | KMS | GenerateDataKey, Decrypt (dynamic import) | Field-level encryption envelope. **Out of scope** — this is general-purpose secret encryption used by Discord/wallet/entity-settings code, not a container-backend concern. Kept as-is; `LocalKMSProvider` is the production default. |
| `api/v1/containers/route.ts` | (calls cloudformation+ecr) | POST creates container; GET lists | Public "deploy a container" surface |
| `api/v1/containers/[id]/route.ts` | (calls cloudformation) | GET/DELETE/PATCH | Container details, teardown, in-place update |
| `api/v1/containers/credentials/route.ts` | (calls ecr) | POST | Vends ECR repo + auth token to CLI for image push |
| `api/v1/containers/quota/route.ts` | (db only) | GET | Quota/pricing — already backend-agnostic |
| `api/v1/containers/[id]/health/route.ts` | (db + http) | GET | Health-check (HTTP probe) — already backend-agnostic |
| `api/v1/containers/[id]/deployments/route.ts` | (db only) | GET | Deployment history from `usage` records — already backend-agnostic |
| `api/v1/containers/[id]/logs/route.ts` | CloudWatch Logs | (stub: 501) | Log fetch (was AWS-only; already stubbed by Agent B) |
| `api/v1/containers/[id]/logs/stream/route.ts` | CloudWatch Logs | (stub: 501) | Live log stream (was AWS-only; already stubbed by Agent B) |
| `api/v1/containers/[id]/metrics/route.ts` | CloudWatch | (stub: 501) | Container CPU/memory metrics (was AWS-only; already stubbed by Agent B) |
| `api/v1/cron/deployment-monitor/route.ts` | CloudFormation | (stub: 501) | Was the long-poll-replacement cron that flipped `deploying` → `running` after CF stack completes |

`@aws-sdk` package deps in `cloud/package.json`: `client-cloudformation`,
`client-cloudwatch`, `client-cloudwatch-logs`, `client-ecr`, `client-kms`,
`middleware-host-header`, `middleware-logger`. All but `client-kms` are
container-only and can be removed.

---

## B. Container lifecycle today (AWS path)

```
USER (CLI / Dashboard)
  │
  ├─ 1. POST /api/v1/containers/credentials  { projectId, version }
  │     ECRManager.createRepository()  → creates elizaos/<org>/<project> repo
  │     ECRManager.getAuthorizationToken() → returns base64 docker login creds
  │     ← { ecrRepositoryUri, ecrImageUri, authToken, registryEndpoint }
  │
  ├─ 2. CLI builds Docker image locally
  │     docker login → ECR
  │     docker push  → registryEndpoint/elizaos/<org>/<project>:<tag>
  │
  ├─ 3. POST /api/v1/containers  { ecr_image_uri, name, project_name, cpu, memory, ... }
  │     a. ECRManager.verifyImageExists()
  │     b. creditsService.reserve(deploymentCost)
  │     c. containersService.createWithQuotaCheck() → DB row, status=pending
  │     d. cloudFormationService.isSharedInfrastructureDeployed()
  │     e. cloudFormationService.createUserStack({...})  ← initiates CF stack
  │        - CF stack provisions: 1× EC2 t4g.small, ECS cluster, task def, ALB target group, listener rule
  │        - CF stack creation takes 8–12 min
  │     f. updateContainerStatus(deploying, { cloudformationStackName })
  │     g. Returns 202 Accepted with { polling: {...} }
  │
  ├─ 4. Cron `* * * * *` GET /api/v1/cron/deployment-monitor
  │     For each container in (building, deploying):
  │       - cloudFormationService.getStack() → check StackStatus
  │       - if CREATE_COMPLETE: updateContainerStatus(running, { loadBalancerUrl, ecsServiceArn, ... })
  │       - if CREATE_FAILED / ROLLBACK_*: updateContainerStatus(failed, { errorMessage }) + refund credits + mark usage record failed
  │
  ├─ 5. Client polls GET /api/v1/containers/<id> every 10s for 10 min
  │     Renders status: pending → building → deploying → running
  │
  ├─ 6. GET /api/v1/containers/<id>/logs  (stub today)
  │     Was: CloudWatch GetLogEvents
  │     GET /api/v1/containers/<id>/logs/stream  (stub today)
  │     Was: CloudWatch StartLiveTail
  │     GET /api/v1/containers/<id>/metrics     (stub today)
  │     Was: CloudWatch GetMetricStatistics
  │
  ├─ 7. PATCH /api/v1/containers/<id>  { cpu, memory, port, ecr_image_uri }
  │     cloudFormationService.updateUserStack()
  │     cloudFormationService.waitForStackUpdate()  ← blocks 5–10 min
  │
  └─ 8. DELETE /api/v1/containers/<id>
        cloudFormationService.deleteUserStack()
        cloudFormationService.waitForStackDeletion(15 min timeout)
        dbPriorityManager.releasePriority()
        Prorated refund + soft-delete container row
```

Crucial pain points the migration fixes:
- `maxDuration = 780` (13 min Vercel timeout) — won't run on Workers (300s cap on paid)
- 13-min sync wait on POST is wasteful and crashes the conversion to Hono
- Per-container EC2 instance is 30–50× the cost of a Docker slot on a shared Hetzner VPS
- ECR + CF + CW have ~3 min cold-start overhead on the AWS API surface

---

## C. Milady-Hetzner research

### Where is "Milady containers"?

**It's already in `cloud/`, not in the parent Milady repo.** The parent
Milady repo (`/Users/shawwalters/eliza-workspace/milady/`) ships:

- The agent **image** (`ghcr.io/milady-ai/agent:v2.0.0-steward-5`, built from
  `eliza/packages/app-core/`) — what runs *inside* the container
- A bare-metal deploy toolkit (`milady/deploy/`,
  `eliza/packages/app-core/deploy/`) — `docker-setup.sh`, `deploy-to-nodes.sh`,
  `nodes.json`, systemd units. This is for self-hosting Milady on a Hetzner
  box, not for orchestrating user containers.

`grep -rln 'hetzner\|hcloud' milady/ --exclude-dir=eliza` → **zero hits**.
The only Hetzner refs in the repo live under `eliza/cloud/` (the cloud
submodule), specifically:

- `cloud/packages/lib/services/docker-ssh.ts` — SSH client w/ pooling, host
  key pinning, env-var or filesystem key loading
- `cloud/packages/lib/services/docker-node-manager.ts` — least-loaded node
  selection, capacity, health checks
- `cloud/packages/lib/services/docker-sandbox-provider.ts` — full lifecycle:
  `create` (pull image, register w/ Steward, `docker run`), `stop` (`docker
  stop` + `docker rm -f`), `checkHealth` (Docker health status poll),
  `runCommand` (`docker exec`)
- `cloud/packages/db/schemas/docker-nodes.ts` — node inventory (hostname,
  ssh_port, ssh_user, host_key_fingerprint, capacity, allocated_count,
  status, enabled)
- `cloud/packages/db/schemas/milady-sandboxes.ts` — provisioned containers
  on those nodes (node_id, container_name, bridge_port, web_ui_port,
  agent_id, status)
- `cloud/api/v1/admin/docker-nodes/*` — admin CRUD for nodes
- `cloud/api/v1/admin/docker-containers/*` — admin observability
- `cloud/api/v1/cron/process-provisioning-jobs/*` — async provisioning
  worker (queue-driven; the model the AWS path was *trying* to be)

**This is the system the user means.** The naming is confusing because
internally we call them "Docker sandboxes" and "Milady sandboxes"; the
user-facing term has been "containers". The work below converts
`/api/v1/containers/*` to be a thin adapter on top of the same backend
that already powers `/api/v1/agents/*`.

### Auth model

SSH with a per-control-plane private key (`MILADY_SSH_KEY` env, base64-
encoded) and host-key pinning per node row in DB
(`docker_nodes.host_key_fingerprint`). Same key for every node; node
fingerprints are pinned to prevent MITM after first connect.

### Deployed?

Yes — already used in production for the Milady sandboxes flow. Node
inventory lives in DB; populate via `POST /api/v1/admin/docker-nodes`
(super-admin only). The fallback `MILADY_DOCKER_NODES` env var allows
seed-only operation before the DB has node rows.

### k3s / Nomad / Docker Swarm?

No — plain Docker over SSH. Each Hetzner VPS runs `dockerd`; the cloud
control plane SSHes in and runs `docker pull / docker create / docker start
/ docker exec / docker stop / docker rm`. Network isolation per container
via a shared bridge network (`milady-isolated`) plus optional Headscale
VPN. Ports are allocated from per-node ranges, persisted in DB, and
de-conflicted via a UNIQUE index.

Tradeoff: no native rolling updates, no auto-rescheduling on node death,
no built-in service mesh. Acceptable for current scale (single container
per app, immutable image tags).

---

## D. Hetzner Cloud API capabilities (sanity check)

The cloud control plane does **not** call the Hetzner Cloud API directly —
it talks SSH+Docker to long-lived Hetzner VPS nodes that are provisioned
manually (or by separate IaC). Cloud-side operations don't need
`hetznerCloud.servers.create()`.

If we ever need elastic node provisioning (add VPS when capacity is full),
the Hetzner Cloud API supports:
- `POST /servers` — provision VPS (~30–60s to ready)
- `POST /servers/<id>/actions/{poweron, poweroff, reboot, shutdown, delete}`
- `POST /volumes` — block storage
- `POST /networks`, `/firewalls`, `/load_balancers`
- No native container primitive (Hetzner Cloud is VPS-first; containers run
  on top via Docker/k3s/Nomad)
- Webhooks: only via Hetzner Status (account-wide), not per-server

For now, scaling is manual: register more VPS nodes via admin API when
existing nodes hit capacity. Documented in the punch list.

---

## E. Architecture decision

### Options considered

1. **Per-tenant Hetzner VPS via Hetzner Cloud API** — simple, expensive
   ($4–5/mo minimum per container), 30–60s provision time, requires us to
   maintain VPS lifecycle code we don't have today. **Rejected** —
   regression vs current Docker-on-shared-node approach.

2. **Shared k3s cluster on Hetzner with namespace-per-tenant** — efficient
   bin-packing, real container primitive (k8s API), proven scale path. But:
   adds a major operational dependency (k3s cluster mgmt), requires us to
   throw out the existing `DockerSandboxProvider` work, and the team has no
   k3s ops experience evident in the repo. **Rejected for v1.**

3. **Nomad / Docker Swarm on Hetzner** — middle ground. Same rejection: we
   already have a working DB-backed orchestrator that does the same job
   without the cluster manager.

4. **Reuse the existing `DockerSandboxProvider` (Docker-over-SSH on
   manually-provisioned Hetzner VPS pool)** — this is what already works.
   New work is a typed adapter (`hetzner-client.ts`) plus rewriting
   `/api/v1/containers/*` against it. **CHOSEN.**

### Why option 4 wins

- Zero new infra. Same control plane that runs user agent sandboxes.
- The Workers-incompatible deps (`@aws-sdk/*`) go away — `ssh2` works on
  Node sidecars but not Workers. We accept this: `/api/v1/containers/*`
  becomes a Node sidecar route group (same as `services/agent-server` and
  `gateway-discord` per `INFRA.md`).
- Scaling story: add Hetzner VPS nodes via `POST /api/v1/admin/docker-nodes`.
  Per-node capacity tracked in DB. Future: auto-provision via Hetzner Cloud
  API when allocated_count / capacity > threshold.
- Logs/metrics: Docker-native. `docker logs` over SSH for fetch, `docker
  logs --follow` for stream, `docker stats --no-stream` for metrics. No
  CloudWatch dependency.
- Image registry: GHCR (already used by `MILADY_DOCKER_IMAGE`). The
  user-supplied image flow becomes "user pushes to a GHCR repo we vend a
  PAT for", or "we pull from a public image". Removes ECR dependency
  entirely.
- Async-by-default: `POST /api/v1/containers` returns 202 immediately;
  client polls; cron monitors. Same lifecycle the AWS path eventually
  evolved into, just without the 13-min sync wait that CloudFormation
  forced.

### Mode of integration: typed client wrapping existing service

`hetzner-client.ts` exposes a clean async interface keyed by `containerId`.
Internally it delegates to `DockerSandboxProvider` + `dockerNodeManager` +
`miladySandboxesRepository`. The API routes never reach for SSH directly.
This:
- Lets us swap the implementation later (e.g. to a Milady-owned Containers
  HTTP service in the parent repo) without touching routes
- Gives a unit-testable seam
- Lets the route group eventually move to a Worker-friendly transport
  (HTTP to a Node sidecar) by changing one file

---

## F → K. Implementation plan — STATUS

| Step | Status | Commit |
|------|--------|--------|
| F. Typed Hetzner client | done | `367d7f2f0 containers: add typed hetzner client wrapping docker-sandbox provider` |
| G. Rewrite container CRUD routes | done | (rolled into `481ad8ac4`) |
| H. Cron handlers | done | `0286eb040 containers: restore sidecar handlers for logs/metrics/deployment-monitor` |
| I+J. Drop AWS deps + env | done | `e1c62e733 containers: drop aws sdk deps + ecr/cloudformation services + env vars` |
| K. INFRA.md + MIGRATION_NOTES.md | done | this commit |

Detail of each step below — kept as the original plan record so future
contributors can see the design intent rather than just the diff.

- **F.** Create `cloud/packages/lib/services/containers/hetzner-client.ts`.
  Methods: `createContainer`, `getContainer`, `listContainers`,
  `deleteContainer`, `tailLogs`, `restartContainer`, `getMetrics`,
  `setEnv`, `setScale`. Backed by `DockerSandboxProvider` and the existing
  Docker schema repos.
- **G.** Rewrite `api/v1/containers/route.ts` and
  `api/v1/containers/[id]/route.ts` against `hetzner-client`. Remove the
  13-min sync wait. POST returns 202 immediately. PATCH and DELETE are
  also async with status reflected on the row.
- **H.** Replace `api/v1/cron/deployment-monitor/route.ts` with a Hetzner-
  aware version that polls Docker container health and flips DB status.
  Cleanup-stuck-provisioning is already backend-agnostic — leave it.
- **I.** Drop `@aws-sdk/client-cloudformation`,
  `@aws-sdk/client-cloudwatch`, `@aws-sdk/client-cloudwatch-logs`,
  `@aws-sdk/client-ecr`, `@aws-sdk/middleware-host-header`,
  `@aws-sdk/middleware-logger` from `cloud/package.json`. Keep
  `@aws-sdk/client-kms` (used by general-purpose secrets encryption).
- **J.** Strip `AWS_REGION`, `AWS_VPC_ID`, `AWS_SUBNET_IDS`,
  `AWS_SECURITY_GROUP_IDS`, `ECS_*`, `ACM_CERTIFICATE_ARN`, `EC2_KEY_NAME`
  from `.env.example` and `wrangler.toml`. Add `MILADY_*` / `HETZNER_*`
  blocks (most already exist).
- **K.** Append a "Container backend" section to `INFRA.md` documenting
  the new flow.

---

## What needs to be built in the Milady repo (Phase 3 punch list)

Most "Milady containers" code already lives in `cloud/` (the cloud
submodule under `milady/eliza/cloud`). The parent Milady repo needs:

1. **Nothing immediately** for the migration to land — the Hetzner-Docker
   control plane is in `cloud/`, the agent image is in `eliza/`, and the
   parent's `deploy/` toolkit is for self-hosting Milady itself, not for
   user containers.

2. **Optional follow-ups** if we decide to move the control plane out of
   `cloud/`:
   - **Milady Containers service** at `milady/services/containers/` —
     would expose the same HTTP surface as `hetzner-client.ts` over a
     loopback or VPC interface. Agent image bake, Steward token
     registration, and Headscale VPN orchestration would move with it.
     Trade: deployable independently of `cloud/`; loses inline DB access.
   - **Hetzner Cloud API integration** for elastic node provisioning —
     auto-add VPS to the pool when `SUM(capacity - allocated_count)` falls
     below threshold. Lives in the new service. Until then, ops adds
     nodes by hand via `POST /api/v1/admin/docker-nodes`.
   - **Auth model between cloud and the new service** — internal shared
     secret (mirrors `AGENT_SERVER_SHARED_SECRET` pattern) or mTLS via
     Headscale.
   - **Where the control plane runs** — same Hetzner pool as the
     containers it manages, behind Headscale VPN. Self-bootstrapping via
     the parent repo's `deploy/docker-setup.sh`.
   - **Migration of existing AWS-hosted user containers** — at the time
     of this writing the AWS path is in production but small (single-
     digit number of customer containers). One-time migration: each
     customer rebuilds their image targeting the GHCR-vended creds (or
     uses a public image), POST /v1/containers re-creates on Hetzner,
     CloudFormation stacks are torn down by the operator (terraform under
     `cloud/infra/terraform/` is owned by Agent C — see "Teardown
     plan").

## Teardown plan (`cloud/infra/terraform/`)

Out of scope for this PR. Agent C / ops decides when to:
- `terraform destroy` the per-user stacks (after every container migrates)
- `terraform destroy` the shared infrastructure stack (`*-elizaos-shared`:
  ALB, IAM roles, ECS cluster, VPC subnets, ECR cleanup policies)
- Delete the ECR repositories (`elizaos/<org>/<project>`)
- Revoke the IAM access key used by `AWS_ACCESS_KEY_ID`

KMS keys and other shared encryption material are **not** torn down — the
encryption service keeps using `client-kms` against the existing key.

---

## Coordination

- **Agent D (auth)** — container routes use `requireAuthOrApiKeyWithOrg`
  from `@/lib/auth`. No direct Privy refs in container files; D's rewrite
  of the shared auth helper is transparent.
- **Agent B (Hono)** — these routes stay in Next.js shape for this pass
  because they require a Node runtime (`ssh2`). They are NOT eligible for
  the Workers conversion (mark as Node-only sidecar in MIGRATION_NOTES).
- **Agent C (infra)** — Cloudflare Workers cannot host the new container
  routes. They run on the Node sidecar (the same one that hosts
  `services/agent-server`). The `/api/v1/containers/*` URL surface is
  proxied from the Worker to the sidecar, same pattern as
  `gateway-discord`. Document in `INFRA.md`.
- **Agent G** — leaves `/api/v1/containers/*` alone; this work owns it.

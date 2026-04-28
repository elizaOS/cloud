/**
 * Hetzner Containers Client
 *
 * Typed adapter that the `/api/v1/containers/*` routes use to drive the
 * underlying Hetzner-Docker control plane. Wraps the existing
 * `DockerSandboxProvider` + `dockerNodesRepository` so the route layer
 * stays free of SSH, port allocation, and node-selection details.
 *
 * This is intentionally a NARROW interface — the public surface for
 * "user containers" is a small subset of what `DockerSandboxProvider`
 * supports for agent sandboxes. New methods get added here only when a
 * route needs them.
 *
 * Implementation notes:
 *
 * - `containerId` in this client maps 1:1 to `containers.id` in the DB.
 *   The Docker `containerName` (e.g. `milady-<agentId>`) is an internal
 *   detail derived from container metadata.
 *
 * - This module imports `ssh2` transitively via `DockerSandboxProvider`
 *   and is therefore Node-only. Cloudflare Workers cannot host the
 *   routes that use it; they run on the Node sidecar (see INFRA.md
 *   "Container backend").
 *
 * - All errors are normalized to `HetznerClientError` so the route layer
 *   has a single error type to map to HTTP status codes.
 */

import { eq } from "drizzle-orm";
import { dbRead, dbWrite } from "@/db/client";
import {
  type Container,
  containersRepository,
  type NewContainer,
} from "@/db/repositories/containers";
import { dockerNodesRepository } from "@/db/repositories/docker-nodes";
import { containers as containersTable } from "@/db/schemas/containers";
import { DockerSandboxProvider } from "@/lib/services/docker-sandbox-provider";
import { DockerSSHClient } from "@/lib/services/docker-ssh";
import { logger } from "@/lib/utils/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Reasons a Hetzner client call can fail in a way the route layer cares about. */
export type HetznerClientErrorCode =
  | "container_not_found"
  | "no_capacity"
  | "image_pull_failed"
  | "container_create_failed"
  | "container_stop_failed"
  | "ssh_unreachable"
  | "invalid_input";

export class HetznerClientError extends Error {
  constructor(
    public readonly code: HetznerClientErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "HetznerClientError";
  }
}

/** Inputs accepted by `createContainer`. Mirrors the public POST schema. */
export interface CreateContainerInput {
  name: string;
  projectName: string;
  description?: string;
  organizationId: string;
  userId: string;
  apiKeyId?: string | null;

  /** Full image reference (e.g. `ghcr.io/owner/repo:tag`). The control plane runs `docker pull` on the target node. */
  image: string;

  /** Application port the container listens on. */
  port: number;

  /** Number of replicas. Currently must be 1 — multi-replica containers are not supported on the shared Docker pool. */
  desiredCount: number;

  /** CPU units (kept for API compat / billing; not enforced by Docker scheduler). */
  cpu: number;

  /** Memory MB (passed to `docker run --memory`). */
  memoryMb: number;

  /** Optional health-check path (probed by the cron monitor). */
  healthCheckPath?: string;

  /** Environment variables injected into the container. */
  environmentVars?: Record<string, string>;
}

/** Stored per-container metadata that lives in `containers.metadata` jsonb. */
export interface HetznerContainerMetadata {
  /** Identifies the backend used to provision this container. */
  provider: "hetzner-docker";
  /** Docker node the container is allocated to (`docker_nodes.node_id`). */
  nodeId: string;
  /** Hostname / IP of the Docker node (snapshot at create-time). */
  hostname: string;
  /** Docker container name on the host (e.g. `milady-<containerId>`). */
  containerName: string;
  /** Host port mapped to the application port. */
  hostPort: number;
  /** Image pulled / running on the node. */
  image: string;
  /** Application port inside the container. */
  containerPort: number;
}

/** Container summary returned to API callers. */
export interface ContainerSummary {
  id: string;
  name: string;
  projectName: string;
  status: Container["status"];
  publicUrl: string | null;
  image: string;
  createdAt: Date;
  updatedAt: Date;
  errorMessage: string | null;
  metadata: HetznerContainerMetadata | null;
}

export interface LogChunk {
  timestamp: Date;
  stream: "stdout" | "stderr";
  message: string;
}

export interface ContainerMetricsSnapshot {
  cpuPercent: number;
  memoryBytes: number;
  memoryLimitBytes: number;
  netRxBytes: number;
  netTxBytes: number;
  blockReadBytes: number;
  blockWriteBytes: number;
  capturedAt: Date;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const DEFAULT_NODE_NETWORK = process.env.MILADY_DOCKER_NETWORK || "milady-isolated";

/** Generate a Docker-safe container name from the DB id. */
function deriveContainerName(containerId: string): string {
  return `milady-app-${containerId.replace(/-/g, "")}`;
}

/** Read the typed metadata blob off a container row, normalizing legacy AWS rows to null. */
function readMetadata(row: Container): HetznerContainerMetadata | null {
  const raw = row.metadata as Record<string, unknown> | null | undefined;
  if (!raw || raw.provider !== "hetzner-docker") return null;
  // Trust the shape because we wrote it. The provider tag is the discriminator.
  return raw as unknown as HetznerContainerMetadata;
}

function rowToSummary(row: Container): ContainerSummary {
  const meta = readMetadata(row);
  return {
    id: row.id,
    name: row.name,
    projectName: row.project_name,
    status: row.status,
    publicUrl: row.load_balancer_url ?? null,
    image:
      meta?.image ?? ((row.metadata as Record<string, unknown>)?.ecr_image_uri as string) ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    errorMessage: row.error_message ?? null,
    metadata: meta,
  };
}

function shellQuote(value: string): string {
  // Same quoting rule used by docker-sandbox-utils: wrap in single quotes,
  // escape interior single quotes by closing-and-reopening.
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function validateEnvKey(key: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    throw new HetznerClientError(
      "invalid_input",
      `Invalid environment variable name: '${key}'. Must start with letter/underscore and contain only alphanumeric and underscores.`,
    );
  }
}

// ---------------------------------------------------------------------------
// HetznerContainersClient
// ---------------------------------------------------------------------------

export class HetznerContainersClient {
  private readonly sandbox = new DockerSandboxProvider();

  // ----------------------------------------------------------------------
  // CRUD
  // ----------------------------------------------------------------------

  /**
   * Create a new container row, allocate a Docker node, pull the image,
   * and start the container. Returns the persisted summary as soon as the
   * container is in `deploying` state — the cron monitor flips to
   * `running` once the Docker health check reports healthy.
   *
   * This method is intentionally synchronous through `docker run`. The
   * SSH+pull+create+start sequence typically takes 20–60s, well below
   * any sane HTTP timeout. Long-haul image pulls (~5min) still complete
   * inside the SSH command timeout (`PULL_TIMEOUT_MS`).
   */
  async createContainer(input: CreateContainerInput): Promise<ContainerSummary> {
    if (input.desiredCount !== 1) {
      throw new HetznerClientError(
        "invalid_input",
        `desiredCount must be 1; multi-replica containers are not supported on the Hetzner-Docker pool.`,
      );
    }
    if (input.environmentVars) {
      for (const key of Object.keys(input.environmentVars)) validateEnvKey(key);
    }

    // 1. Pre-create the DB row in `pending` so the rest of the flow has an id.
    const newRow: NewContainer = {
      name: input.name,
      project_name: input.projectName,
      description: input.description ?? null,
      organization_id: input.organizationId,
      user_id: input.userId,
      api_key_id: input.apiKeyId ?? null,
      image_tag: input.image,
      port: input.port,
      desired_count: 1,
      cpu: input.cpu,
      memory: input.memoryMb,
      architecture: "arm64",
      environment_vars: input.environmentVars ?? {},
      health_check_path: input.healthCheckPath ?? "/health",
      status: "pending",
      is_update: "false",
      metadata: { provider: "hetzner-docker", image: input.image },
    };

    const row = await containersRepository.createWithQuotaCheck(newRow);

    // 2. Pick the least-loaded enabled node. The repo also tracks `enabled`
    //    so disabled nodes are excluded automatically.
    const node = await dockerNodesRepository.findLeastLoaded();
    if (!node) {
      await containersRepository.updateStatus(
        row.id,
        "failed",
        "No Hetzner-Docker capacity available — register more nodes or wait for existing containers to drain.",
      );
      throw new HetznerClientError("no_capacity", "No Hetzner-Docker capacity available");
    }

    // 3. SSH into the node, pull the image, create + start the container.
    const ssh = DockerSSHClient.getClient(
      node.hostname,
      node.ssh_port ?? 22,
      node.host_key_fingerprint ?? undefined,
      node.ssh_user ?? "root",
    );

    const containerName = deriveContainerName(row.id);
    // Host port = container port until we wire dynamic allocation per-app
    // through the same `getUsedPorts` flow used by the sandbox provider.
    // For v1 the public URL is the node's hostname:hostPort; ALB / shared
    // ingress is a follow-up.
    const hostPort = input.port;

    try {
      await containersRepository.update(row.id, input.organizationId, {
        status: "building",
        deployment_log: `Pulling image ${input.image} on ${node.node_id}...`,
      });
      await ssh.exec(`docker pull ${shellQuote(input.image)}`, 5 * 60 * 1000);

      const envFlags = Object.entries(input.environmentVars ?? {})
        .map(([k, v]) => `-e ${shellQuote(`${k}=${v}`)}`)
        .join(" ");

      const dockerCreateCmd = [
        "docker create",
        `--name ${shellQuote(containerName)}`,
        "--restart unless-stopped",
        `--network ${shellQuote(DEFAULT_NODE_NETWORK)}`,
        `--memory ${input.memoryMb}m`,
        `-p ${hostPort}:${input.port}`,
        envFlags,
        shellQuote(input.image),
      ]
        .filter((part) => part.length > 0)
        .join(" ");

      await ssh.exec(dockerCreateCmd, 60_000);
      await ssh.exec(`docker start ${shellQuote(containerName)}`, 60_000);
      await dockerNodesRepository.incrementAllocated(node.node_id);

      const meta: HetznerContainerMetadata = {
        provider: "hetzner-docker",
        nodeId: node.node_id,
        hostname: node.hostname,
        containerName,
        hostPort,
        image: input.image,
        containerPort: input.port,
      };

      const updated = await containersRepository.update(row.id, input.organizationId, {
        status: "deploying",
        deployment_log: `Container started on ${node.node_id}; waiting for health check...`,
        load_balancer_url: `http://${node.hostname}:${hostPort}`,
        metadata: meta as unknown as Record<string, unknown>,
      });

      return rowToSummary(
        updated ?? { ...row, metadata: meta as unknown as Record<string, unknown> },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("[hetzner-client] container create failed", {
        containerId: row.id,
        nodeId: node.node_id,
        error: message,
      });
      // Best-effort cleanup of the half-created Docker container
      await ssh.exec(`docker rm -f ${shellQuote(containerName)}`, 30_000).catch(() => {});
      await containersRepository.updateStatus(row.id, "failed", message);
      throw new HetznerClientError("container_create_failed", message, err);
    }
  }

  /** Look up a single container by id, scoped to its organization. */
  async getContainer(
    containerId: string,
    organizationId: string,
  ): Promise<ContainerSummary | null> {
    const row = await containersRepository.findById(containerId, organizationId);
    return row ? rowToSummary(row) : null;
  }

  /** List all containers for an organization. */
  async listContainers(organizationId: string): Promise<ContainerSummary[]> {
    const rows = await containersRepository.listByOrganization(organizationId);
    return rows.map(rowToSummary);
  }

  /**
   * Tear down a container: stop + remove on the host, decrement the
   * node's allocated count, then delete the DB row. Errors during the
   * SSH stage are surfaced — we do NOT silently delete the row if the
   * host cleanup fails, because that would leak a Docker container.
   */
  async deleteContainer(containerId: string, organizationId: string): Promise<void> {
    const row = await containersRepository.findById(containerId, organizationId);
    if (!row) {
      throw new HetznerClientError("container_not_found", `container ${containerId} not found`);
    }

    const meta = readMetadata(row);
    if (meta) {
      await this.execOnNode(meta, async (ssh) => {
        await ssh
          .exec(`docker stop -t 10 ${shellQuote(meta.containerName)}`, 30_000)
          .catch((err) => {
            logger.warn(`[hetzner-client] docker stop failed for ${meta.containerName}`, {
              error: err instanceof Error ? err.message : String(err),
            });
          });
        await ssh.exec(`docker rm -f ${shellQuote(meta.containerName)}`, 30_000);
      });

      await dockerNodesRepository.decrementAllocated(meta.nodeId).catch((err) => {
        logger.warn(`[hetzner-client] decrementAllocated failed for ${meta.nodeId}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    await containersRepository.delete(containerId, organizationId);
  }

  /** Restart a container in-place (`docker restart`). Status flips to `deploying`; the cron monitor confirms `running`. */
  async restartContainer(containerId: string, organizationId: string): Promise<ContainerSummary> {
    const row = await this.requireRowWithMeta(containerId, organizationId);
    const { meta } = row;

    await this.execOnNode(meta, (ssh) =>
      ssh.exec(`docker restart ${shellQuote(meta.containerName)}`, 30_000),
    );

    const updated = await containersRepository.update(containerId, organizationId, {
      status: "deploying",
      deployment_log: "Container restarted; waiting for health check...",
    });
    return rowToSummary(updated ?? row.row);
  }

  /**
   * Replace the env var set on a container. Implemented as
   * `docker stop` + `docker rm` + `docker create` with the new env, then
   * `docker start`. Same pattern Docker itself uses since env vars cannot
   * be mutated on a running container.
   */
  async setEnv(
    containerId: string,
    organizationId: string,
    environmentVars: Record<string, string>,
  ): Promise<ContainerSummary> {
    for (const key of Object.keys(environmentVars)) validateEnvKey(key);
    const row = await this.requireRowWithMeta(containerId, organizationId);
    const { meta } = row;

    await this.execOnNode(meta, async (ssh) => {
      await ssh.exec(`docker stop -t 10 ${shellQuote(meta.containerName)}`, 30_000).catch(() => {});
      await ssh.exec(`docker rm -f ${shellQuote(meta.containerName)}`, 30_000);

      const envFlags = Object.entries(environmentVars)
        .map(([k, v]) => `-e ${shellQuote(`${k}=${v}`)}`)
        .join(" ");

      await ssh.exec(
        [
          "docker create",
          `--name ${shellQuote(meta.containerName)}`,
          "--restart unless-stopped",
          `--network ${shellQuote(DEFAULT_NODE_NETWORK)}`,
          `--memory ${row.row.memory}m`,
          `-p ${meta.hostPort}:${meta.containerPort}`,
          envFlags,
          shellQuote(meta.image),
        ]
          .filter(Boolean)
          .join(" "),
        60_000,
      );
      await ssh.exec(`docker start ${shellQuote(meta.containerName)}`, 60_000);
    });

    const updated = await containersRepository.update(containerId, organizationId, {
      environment_vars: environmentVars,
      status: "deploying",
      deployment_log: "Env vars updated; container recreated. Waiting for health check...",
    });
    return rowToSummary(updated ?? row.row);
  }

  /**
   * Multi-replica scale is not supported on the shared Docker pool;
   * accept only `desiredCount === 1` and treat anything else as an
   * `invalid_input` error. Kept on the interface so the route layer can
   * 400 cleanly without a missing-method catch.
   */
  async setScale(
    _containerId: string,
    _organizationId: string,
    desiredCount: number,
  ): Promise<void> {
    if (desiredCount === 1) return;
    throw new HetznerClientError(
      "invalid_input",
      `desiredCount must be 1; multi-replica containers are not supported on the Hetzner-Docker pool.`,
    );
  }

  // ----------------------------------------------------------------------
  // Observability
  // ----------------------------------------------------------------------

  /**
   * Fetch the last `tailLines` lines of container logs. Returns plain
   * text, line-delimited; the route layer streams it back to the client.
   *
   * Streaming (`docker logs --follow`) is intentionally NOT implemented
   * here — that requires holding an open SSH channel for the duration
   * of the client's connection, which doesn't compose well with
   * serverless. The `/api/v1/containers/[id]/logs/stream/route.ts`
   * route remains a 501 stub until we add an SSE adapter on the Node
   * sidecar.
   */
  async tailLogs(containerId: string, organizationId: string, tailLines = 200): Promise<string> {
    if (!Number.isInteger(tailLines) || tailLines < 1 || tailLines > 10_000) {
      throw new HetznerClientError("invalid_input", "tailLines must be 1..10000");
    }
    const row = await this.requireRowWithMeta(containerId, organizationId);
    const { meta } = row;

    return this.execOnNode(meta, (ssh) =>
      ssh.exec(`docker logs --tail ${tailLines} ${shellQuote(meta.containerName)} 2>&1`, 30_000),
    );
  }

  /**
   * Snapshot CPU / memory / net / block I/O via `docker stats --no-stream`.
   * Not a time series — callers that want one need to poll. CloudWatch's
   * built-in 1-min granularity series is not available on Docker.
   */
  async getMetrics(containerId: string, organizationId: string): Promise<ContainerMetricsSnapshot> {
    const row = await this.requireRowWithMeta(containerId, organizationId);
    const { meta } = row;

    // Format: container, cpu_perc, mem_usage/limit, net_io, block_io
    // We use a strict format string so the parse below stays simple.
    const raw = await this.execOnNode(meta, (ssh) =>
      ssh.exec(
        `docker stats --no-stream --format '{{.CPUPerc}}|{{.MemUsage}}|{{.NetIO}}|{{.BlockIO}}' ${shellQuote(meta.containerName)}`,
        15_000,
      ),
    );

    return parseDockerStats(raw);
  }

  // ----------------------------------------------------------------------
  // Health monitor (used by deployment-monitor cron)
  // ----------------------------------------------------------------------

  /**
   * Inspect the Docker health status of every container in
   * (`building`, `deploying`) and flip `running` / `failed` accordingly.
   * Called from the deployment-monitor cron handler.
   */
  async monitorInflight(): Promise<{ checked: number; running: number; failed: number }> {
    const inflight = await dbRead
      .select()
      .from(containersTable)
      .where(eq(containersTable.status, "deploying"));

    let running = 0;
    let failed = 0;

    for (const row of inflight) {
      const meta = readMetadata(row);
      if (!meta) continue; // not a hetzner-docker container; skip

      try {
        const status = (
          await this.execOnNode(meta, (ssh) =>
            ssh.exec(
              `docker inspect --format '{{.State.Health.Status}}' ${shellQuote(meta.containerName)} 2>/dev/null || docker inspect --format '{{.State.Status}}' ${shellQuote(meta.containerName)}`,
              15_000,
            ),
          )
        ).trim();

        if (status === "healthy" || status === "running") {
          await dbWrite
            .update(containersTable)
            .set({
              status: "running",
              last_deployed_at: new Date(),
              updated_at: new Date(),
            })
            .where(eq(containersTable.id, row.id));
          running += 1;
        } else if (status === "exited" || status === "dead") {
          await dbWrite
            .update(containersTable)
            .set({
              status: "failed",
              error_message: `Container is ${status}`,
              updated_at: new Date(),
            })
            .where(eq(containersTable.id, row.id));
          failed += 1;
        }
        // else still starting — leave alone
      } catch (err) {
        logger.warn(`[hetzner-client] monitor probe failed for ${row.id}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { checked: inflight.length, running, failed };
  }

  // ----------------------------------------------------------------------
  // Internal helpers
  // ----------------------------------------------------------------------

  private async requireRowWithMeta(
    containerId: string,
    organizationId: string,
  ): Promise<{ row: Container; meta: HetznerContainerMetadata }> {
    const row = await containersRepository.findById(containerId, organizationId);
    if (!row) {
      throw new HetznerClientError("container_not_found", `container ${containerId} not found`);
    }
    const meta = readMetadata(row);
    if (!meta) {
      throw new HetznerClientError(
        "container_not_found",
        `container ${containerId} has no Hetzner backend metadata (legacy AWS row?)`,
      );
    }
    return { row, meta };
  }

  private async execOnNode<T>(
    meta: HetznerContainerMetadata,
    fn: (ssh: DockerSSHClient) => Promise<T>,
  ): Promise<T> {
    const node = await dockerNodesRepository.findByNodeId(meta.nodeId);
    const hostname = node?.hostname ?? meta.hostname;
    const ssh = DockerSSHClient.getClient(
      hostname,
      node?.ssh_port ?? 22,
      node?.host_key_fingerprint ?? undefined,
      node?.ssh_user ?? "root",
    );
    try {
      return await fn(ssh);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // SSH connection-level failures are reclassified so the route layer
      // can return a 503 instead of a 500.
      if (
        message.includes("ECONNREFUSED") ||
        message.includes("ETIMEDOUT") ||
        message.includes("connect timeout")
      ) {
        throw new HetznerClientError("ssh_unreachable", message, err);
      }
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

/** Parse the output of `docker stats --no-stream --format ...`. */
export function parseDockerStats(raw: string): ContainerMetricsSnapshot {
  const trimmed = raw.trim().split("\n").pop() ?? "";
  const [cpuPerc, memUsage, netIo, blockIo] = trimmed.split("|");
  if (!cpuPerc || !memUsage || !netIo || !blockIo) {
    throw new HetznerClientError(
      "invalid_input",
      `Failed to parse docker stats output: ${raw.slice(0, 200)}`,
    );
  }

  const cpuPercent = parseFloat(cpuPerc.replace("%", ""));
  const [memUsedRaw, memLimitRaw] = memUsage.split("/").map((s) => s.trim());
  const memoryBytes = parseSize(memUsedRaw);
  const memoryLimitBytes = parseSize(memLimitRaw);
  const [netRxRaw, netTxRaw] = netIo.split("/").map((s) => s.trim());
  const [blockReadRaw, blockWriteRaw] = blockIo.split("/").map((s) => s.trim());

  return {
    cpuPercent,
    memoryBytes,
    memoryLimitBytes,
    netRxBytes: parseSize(netRxRaw),
    netTxBytes: parseSize(netTxRaw),
    blockReadBytes: parseSize(blockReadRaw),
    blockWriteBytes: parseSize(blockWriteRaw),
    capturedAt: new Date(),
  };
}

const SIZE_UNITS: Record<string, number> = {
  b: 1,
  kb: 1_000,
  mb: 1_000_000,
  gb: 1_000_000_000,
  tb: 1_000_000_000_000,
  kib: 1_024,
  mib: 1_024 ** 2,
  gib: 1_024 ** 3,
  tib: 1_024 ** 4,
};

function parseSize(raw: string): number {
  const match = raw.match(/^([\d.]+)\s*([a-zA-Z]+)?$/);
  if (!match) return 0;
  const [, n, unit] = match;
  const multiplier = unit ? (SIZE_UNITS[unit.toLowerCase()] ?? 1) : 1;
  return Math.round(parseFloat(n) * multiplier);
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: HetznerContainersClient | null = null;

export function getHetznerContainersClient(): HetznerContainersClient {
  if (!instance) instance = new HetznerContainersClient();
  return instance;
}

// `LogChunk` is exported above as a type. The default streaming surface
// uses `tailLogs()` returning plain text; SSE-based streaming will be
// added on the Node sidecar that hosts these routes.
export type { Container, NewContainer };

/**
 * DockerSandboxProvider — SandboxProvider implementation for Docker containers
 * on remote VPS nodes.
 *
 * Manages the full lifecycle: create (pull image + docker run), stop/remove,
 * health-check, and arbitrary command execution inside containers.
 *
 * Reference: milady-cloud/backend/services/container-orchestrator.ts
 */

import { DockerSSHClient } from "@/lib/services/docker-ssh";
import { dockerNodeManager } from "@/lib/services/docker-node-manager";
import { dockerNodesRepository } from "@/db/repositories/docker-nodes";
import { miladySandboxesRepository } from "@/db/repositories/milady-sandboxes";
import { logger } from "@/lib/utils/logger";
import type {
  SandboxProvider,
  SandboxHandle,
  SandboxCreateConfig,
} from "./sandbox-provider";
import { headscaleIntegration } from "./headscale-integration";
import {
  shellQuote,
  validateAgentId,
  validateAgentName,
  allocatePort,
  getContainerName,
  getVolumePath,
  parseDockerNodes,
  BRIDGE_PORT_MIN,
  BRIDGE_PORT_MAX,
  WEBUI_PORT_MIN,
  WEBUI_PORT_MAX,
  type DockerNodeEnv,
} from "./docker-sandbox-utils";

// ---------------------------------------------------------------------------
// Exported metadata type for strongly-typed provider metadata
// ---------------------------------------------------------------------------

/** Typed metadata returned by DockerSandboxProvider in SandboxHandle.metadata */
export interface DockerSandboxMetadata {
  provider: "docker";
  nodeId: string;
  hostname: string;
  containerName: string;
  bridgePort: number;
  webUiPort: number;
  agentId: string;
  volumePath: string;
  dockerImage: string;
  headscaleIp?: string;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface ContainerMeta {
  nodeId: string;
  hostname: string;
  containerName: string;
  bridgePort: number;
  webUiPort: number;
  agentId: string;
  sshPort: number;
  sshUser: string;
  hostKeyFingerprint?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DOCKER_IMAGE =
  process.env.MILADY_DOCKER_IMAGE || "milady/agent:cloud-full-ui";

/** Default SSH port when not specified by DB node record. */
const DEFAULT_SSH_PORT = 22;

/** Default SSH user when not specified by DB node record. */
const DEFAULT_SSH_USERNAME = process.env.MILADY_SSH_USER || "root";

/** Health-check polling: interval between retries (ms). */
const HEALTH_CHECK_POLL_INTERVAL_MS = 3_000;

/** Health-check polling: total timeout (ms). */
const HEALTH_CHECK_TIMEOUT_MS = 60_000;

/** Single HTTP request timeout for health check (ms). */
const HEALTH_CHECK_REQUEST_TIMEOUT_MS = 8_000;

/** SSH command timeout for docker pull (can be slow on first pull). */
const PULL_TIMEOUT_MS = 300_000; // 5 min

/** SSH command timeout for docker run / stop / rm. */
const DOCKER_CMD_TIMEOUT_MS = 60_000;

/**
 * Get the set of ports currently allocated on a specific node.
 * Queries the DB for active sandboxes on that node.
 *
 * Note: Combines bridge and web UI ports into a single set for simplicity.
 * Since the port ranges never overlap (bridge: 18790-19790, web UI: 20000-25000),
 * this doesn't cause false conflicts. The performance cost is negligible (dozens
 * of ports max per node).
 */
async function getUsedPorts(nodeId: string): Promise<Set<number>> {
  const used = new Set<number>();
  try {
    const sandboxes = await miladySandboxesRepository.listByNodeId(nodeId);
    for (const s of sandboxes) {
      if (s.bridge_port) used.add(s.bridge_port);
      if (s.web_ui_port) used.add(s.web_ui_port);
    }
  } catch (err) {
    logger.warn(
      `[docker-sandbox] Failed to query used ports for node ${nodeId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return used;
}

// ---------------------------------------------------------------------------
// DockerSandboxProvider
// ---------------------------------------------------------------------------

export class DockerSandboxProvider implements SandboxProvider {
  /**
   * In-memory container metadata cache.
   * In serverless environments (Vercel), this cache is per-request and always
   * starts empty — the DB fallback in resolveContainer() handles rehydration.
   * In long-lived processes (Docker self-hosting), this persists across requests.
   */
  private containers = new Map<string, ContainerMeta>();

  // ------------------------------------------------------------------
  // create
  // ------------------------------------------------------------------

  /**
   * Create a sandbox container with automatic retry on port-collision TOCTOU races.
   *
   * Wraps {@link _createOnce} in a retry loop (up to 3 attempts with jitter).
   * On each attempt, fresh ports are allocated. If a prior attempt left a
   * ghost container running, it is cleaned up before retrying.
   *
   * NOTE: The DB INSERT (in milady-sandbox.ts) happens *after* this method
   * returns. If that INSERT hits a UNIQUE constraint violation (PG 23505),
   * the caller should call `stop(sandboxId)` to remove the ghost container
   * and then retry the full flow.
   */
  async create(config: SandboxCreateConfig): Promise<SandboxHandle> {
    const MAX_ATTEMPTS = 3;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await this._createOnce(config);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const isPortCollision =
          lastError.message.includes("23505") ||
          lastError.message.includes("unique constraint") ||
          lastError.message.includes("already in use") ||
          lastError.message.includes("port is already allocated");

        if (!isPortCollision || attempt === MAX_ATTEMPTS) {
          throw lastError;
        }

        // Clean up ghost container from the failed attempt
        const containerName = getContainerName(config.agentId);
        logger.warn(
          `[docker-sandbox] Port collision on attempt ${attempt}/${MAX_ATTEMPTS} for ${containerName}, cleaning up and retrying...`,
        );
        try {
          // sandboxId === containerName for Docker provider (both are `milady-${agentId}`)
          await this.stop(containerName);
        } catch {
          // Ghost may not exist or already be gone — safe to ignore
        }

        // Jitter: 200–800ms to desynchronise concurrent callers
        const jitterMs = 200 + Math.floor(Math.random() * 600);
        await new Promise((resolve) => setTimeout(resolve, jitterMs));
      }
    }

    // Unreachable, but satisfies the compiler
    throw (
      lastError ??
      new Error("[docker-sandbox] create exhausted all retry attempts")
    );
  }

  /**
   * Create a single sandbox container (no retry).
   *
   * TOCTOU note: Port allocation is racy under concurrent provisioning.
   * The DB has a partial UNIQUE index on (node_id, bridge_port) for active
   * sandboxes, so a duplicate will fail at INSERT time. The public `create()`
   * method wraps this in a retry loop to handle port collisions automatically.
   */
  private async _createOnce(
    config: SandboxCreateConfig,
  ): Promise<SandboxHandle> {
    const { agentId, agentName, environmentVars } = config;

    // 1. Input validation
    validateAgentName(agentName);
    validateAgentId(agentId);

    // 2. Select target node via DockerNodeManager (least-loaded, DB-backed)
    // TODO(PR-376): getAvailableNode + incrementAllocated + getUsedPorts are three
    // sequential DB round-trips without a transaction boundary. In high-concurrency
    // scenarios, capacity could change between queries. The UNIQUE port index and
    // retry logic provide safety, but a proper transaction would be cleaner.
    const dbNode = await dockerNodeManager.getAvailableNode();

    let nodeId: string;
    let hostname: string;
    let sshPort = DEFAULT_SSH_PORT;
    let sshUser = DEFAULT_SSH_USERNAME;

    // host_key_fingerprint from DB node (null for env-var fallback, TOFU applies)
    let hostKeyFingerprint: string | undefined;

    if (dbNode) {
      nodeId = dbNode.node_id;
      hostname = dbNode.hostname;
      sshPort = dbNode.ssh_port ?? DEFAULT_SSH_PORT;
      sshUser = dbNode.ssh_user ?? DEFAULT_SSH_USERNAME;
      hostKeyFingerprint = dbNode.host_key_fingerprint ?? undefined;
      // Increment allocated_count in DB
      await dockerNodesRepository.incrementAllocated(nodeId);
    } else {
      // Fallback: seed-only path for initial setup before nodes are registered via Admin API.
      // Uses random selection (no least-loaded placement or capacity checks).
      // Operators should register nodes via POST /admin/docker-nodes for production use.
      logger.warn(
        "[docker-sandbox] No nodes in DB, falling back to MILADY_DOCKER_NODES env var (seed-only, no load balancing)",
      );
      const envNodes = parseDockerNodes();
      const envNode = envNodes[Math.floor(Math.random() * envNodes.length)]!;
      nodeId = envNode.nodeId;
      hostname = envNode.hostname;
      // Env-var nodes use defaults for SSH port/user — log a warning since
      // host key fingerprint is unavailable (TOFU applies)
      logger.warn(
        `[docker-sandbox] Env-var fallback node ${nodeId}: using SSH defaults (port ${sshPort}, user ${sshUser}, no fingerprint)`,
      );
    }

    logger.info(
      `[docker-sandbox] Creating container for agent ${agentId} on node ${nodeId} (${hostname})`,
    );

    // 3. Allocate ports (check DB for existing assignments to avoid collisions)
    const usedPorts = await getUsedPorts(nodeId);
    const bridgePort = allocatePort(
      BRIDGE_PORT_MIN,
      BRIDGE_PORT_MAX,
      usedPorts,
    );
    // No need to add bridgePort to exclusion set — web UI port range [20000,25000)
    // never overlaps bridge range [18790,19790)
    const webUiPort = allocatePort(WEBUI_PORT_MIN, WEBUI_PORT_MAX, usedPorts);
    const containerName = getContainerName(agentId);
    const volumePath = getVolumePath(agentId);

    // 4. Optionally prepare Headscale VPN
    const headscaleEnabled = !!process.env.HEADSCALE_API_KEY;
    let headscaleIp: string | null = null;

    // Collect VPN env vars separately to avoid mutating the caller's environmentVars
    let vpnEnvVars: Record<string, string> = {};
    if (headscaleEnabled) {
      try {
        const vpnSetup =
          await headscaleIntegration.prepareContainerVPN(agentId);
        vpnEnvVars = vpnSetup.envVars;
        logger.info(`[docker-sandbox] Headscale VPN enabled for ${agentId}`);
      } catch (err) {
        logger.warn(
          `[docker-sandbox] Headscale VPN preparation failed for ${agentId}: ${err instanceof Error ? err.message : String(err)}`,
        );
        // Continue without VPN — not a critical failure
      }
    }

    // 5. Build environment flags (spread to avoid mutating caller's environmentVars)
    const allEnv: Record<string, string> = {
      ...environmentVars,
      ...vpnEnvVars,
      AGENT_NAME: agentName,
      PORT: "2138",
      BRIDGE_PORT: "31337",
      // Eliza server requires JWT_SECRET in production mode.
      // Generate a unique per-container secret if the caller didn't provide one.
      JWT_SECRET: environmentVars.JWT_SECRET || crypto.randomUUID(),
    };

    // Validate env var keys to prevent shell command injection via malformed keys
    for (const key of Object.keys(allEnv)) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
        throw new Error(
          `[docker-sandbox] Invalid environment variable key: "${key}"`,
        );
      }
    }

    // Note: Values do not need control-character validation. The shellQuote() function
    // wraps each "key=value" pair in single quotes and escapes embedded single quotes as '"'"',
    // which makes all values (including those with newlines, tabs, or other control chars)
    // safe inside the shell command. Single-quoted strings in bash preserve all characters
    // literally except single quotes (which shellQuote already handles).

    const envFlags = Object.entries(allEnv)
      .map(([key, value]) => `-e ${shellQuote(`${key}=${value}`)}`)
      .join(" ");

    // 6. Build docker run command
    // Only add NET_ADMIN and /dev/net/tun when headscale is actually enabled
    const dockerRunCmd = [
      "docker run -d",
      `--name ${shellQuote(containerName)}`,
      "--restart unless-stopped",
      ...(headscaleEnabled
        ? ["--cap-add=NET_ADMIN", "--device /dev/net/tun"]
        : []),
      `-v ${shellQuote(volumePath)}:/app/data`,
      `-p ${bridgePort}:31337`,
      `-p ${webUiPort}:2138`,
      envFlags,
      shellQuote(DOCKER_IMAGE),
    ].join(" ");

    // 7. SSH to node, ensure volume dir, pull image, run container
    // Pass hostKeyFingerprint so pooled clients pin the key when available
    const ssh = DockerSSHClient.getClient(
      hostname,
      sshPort,
      hostKeyFingerprint,
      sshUser,
    );

    try {
      // Ensure volume directory exists
      await ssh.exec(
        `mkdir -p ${shellQuote(volumePath)}`,
        DOCKER_CMD_TIMEOUT_MS,
      );

      // Pull image (may take a while on first run)
      logger.info(
        `[docker-sandbox] Pulling image ${DOCKER_IMAGE} on ${nodeId}`,
      );
      try {
        await ssh.exec(
          `docker pull ${shellQuote(DOCKER_IMAGE)}`,
          PULL_TIMEOUT_MS,
        );
        logger.info(`[docker-sandbox] Image pulled successfully on ${nodeId}`);
      } catch (pullErr) {
        logger.warn(
          `[docker-sandbox] Image pull failed on ${nodeId} (will use cached): ${pullErr instanceof Error ? pullErr.message : String(pullErr)}`,
        );
      }

      // Run container
      const output = await ssh.exec(dockerRunCmd, DOCKER_CMD_TIMEOUT_MS);
      const containerId = output.trim().slice(0, 12);
      logger.info(
        `[docker-sandbox] Container created on ${nodeId}: ${containerId} (${containerName})`,
      );
    } catch (err) {
      // Rollback allocated_count on failure
      if (dbNode) {
        await dockerNodesRepository.decrementAllocated(nodeId).catch(() => {});
      }
      // Clean up Headscale pre-auth key if VPN was prepared
      if (headscaleEnabled) {
        await headscaleIntegration
          .cleanupContainerVPN(agentId)
          .catch((cleanupErr) => {
            logger.warn(
              `[docker-sandbox] Headscale cleanup failed during rollback for ${agentId}: ${cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)}`,
            );
          });
      }
      throw new Error(
        `[docker-sandbox] Failed to create container on ${nodeId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // 8. Wait for Headscale VPN registration if enabled
    if (headscaleEnabled) {
      try {
        headscaleIp = await headscaleIntegration.waitForVPNRegistration(
          agentId,
          60_000,
        );
        if (headscaleIp) {
          logger.info(
            `[docker-sandbox] Container ${containerName} registered on VPN: ${headscaleIp}`,
          );
        } else {
          logger.warn(
            `[docker-sandbox] VPN registration timeout for ${containerName}, continuing without VPN`,
          );
        }
      } catch (err) {
        logger.warn(
          `[docker-sandbox] VPN registration failed for ${containerName}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // 9. Store metadata in in-memory cache (includes SSH details for stop/runCommand)
    const meta: ContainerMeta = {
      nodeId,
      hostname,
      containerName,
      bridgePort,
      webUiPort,
      agentId,
      sshPort,
      sshUser,
      hostKeyFingerprint,
    };
    this.containers.set(containerName, meta);

    // 10. Return handle with strongly-typed metadata
    const targetHost = headscaleIp || hostname;

    const metadata: DockerSandboxMetadata = {
      provider: "docker",
      nodeId,
      hostname,
      containerName,
      bridgePort,
      webUiPort,
      agentId,
      volumePath,
      dockerImage: DOCKER_IMAGE,
      headscaleIp: headscaleIp || undefined,
    };

    return {
      sandboxId: containerName,
      bridgeUrl: `http://${targetHost}:${bridgePort}`,
      healthUrl: `http://${targetHost}:${webUiPort}`,
      metadata: metadata as unknown as Record<string, unknown>,
    };
  }

  // ------------------------------------------------------------------
  // stop
  // ------------------------------------------------------------------

  async stop(sandboxId: string): Promise<void> {
    const meta = await this.resolveContainer(sandboxId);

    logger.info(
      `[docker-sandbox] Stopping container ${meta.containerName} on ${meta.nodeId} (${meta.hostname})`,
    );

    const ssh = DockerSSHClient.getClient(
      meta.hostname,
      meta.sshPort,
      meta.hostKeyFingerprint,
      meta.sshUser,
    );

    try {
      // Graceful stop with 10s timeout, then force-remove
      await ssh.exec(
        `docker stop -t 10 ${shellQuote(meta.containerName)}`,
        DOCKER_CMD_TIMEOUT_MS,
      );
      logger.info(`[docker-sandbox] Container stopped: ${meta.containerName}`);
    } catch (stopErr) {
      logger.warn(
        `[docker-sandbox] docker stop failed for ${meta.containerName}: ${stopErr instanceof Error ? stopErr.message : String(stopErr)}`,
      );
    }

    try {
      await ssh.exec(
        `docker rm -f ${shellQuote(meta.containerName)}`,
        DOCKER_CMD_TIMEOUT_MS,
      );
      logger.info(`[docker-sandbox] Container removed: ${meta.containerName}`);
    } catch (rmErr) {
      logger.error(
        `[docker-sandbox] docker rm failed for ${meta.containerName}: ${rmErr instanceof Error ? rmErr.message : String(rmErr)}`,
      );
    }

    // Decrement allocated_count on the node
    await dockerNodesRepository.decrementAllocated(meta.nodeId).catch((err) => {
      logger.warn(
        `[docker-sandbox] Failed to decrement allocated_count for node ${meta.nodeId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    // Clean up Headscale VPN registration if enabled
    if (process.env.HEADSCALE_API_KEY && meta.agentId) {
      await headscaleIntegration
        .cleanupContainerVPN(meta.agentId)
        .catch((err) => {
          logger.warn(
            `[docker-sandbox] Headscale cleanup failed for ${meta.agentId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    }

    // Remove from in-memory registry
    this.containers.delete(meta.containerName);
  }

  // ------------------------------------------------------------------
  // checkHealth
  // ------------------------------------------------------------------

  async checkHealth(healthUrl: string): Promise<boolean> {
    const url = healthUrl.replace(/\/$/, "") + "/health";
    const deadline = Date.now() + HEALTH_CHECK_TIMEOUT_MS;

    logger.info(
      `[docker-sandbox] Polling health at ${url} (timeout: ${HEALTH_CHECK_TIMEOUT_MS / 1000}s)`,
    );

    while (Date.now() < deadline) {
      try {
        const response = await fetch(url, {
          method: "GET",
          signal: AbortSignal.timeout(HEALTH_CHECK_REQUEST_TIMEOUT_MS),
        });

        if (response.ok) {
          logger.info(`[docker-sandbox] Health check passed: ${url}`);
          return true;
        }

        logger.debug(
          `[docker-sandbox] Health check returned ${response.status}, retrying...`,
        );
      } catch {
        // Connection refused, timeout, etc. — expected while container boots
      }

      // Wait before retrying (but don't overshoot the deadline)
      const remaining = deadline - Date.now();
      if (remaining > HEALTH_CHECK_POLL_INTERVAL_MS) {
        await new Promise((resolve) =>
          setTimeout(resolve, HEALTH_CHECK_POLL_INTERVAL_MS),
        );
      } else if (remaining > 0) {
        // One last attempt after a short wait
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(remaining, 1000)),
        );
      } else {
        break;
      }
    }

    logger.warn(
      `[docker-sandbox] Health check timed out after ${HEALTH_CHECK_TIMEOUT_MS / 1000}s: ${url}`,
    );
    return false;
  }

  // ------------------------------------------------------------------
  // runCommand
  // ------------------------------------------------------------------

  async runCommand(
    sandboxId: string,
    cmd: string,
    args?: string[],
  ): Promise<string> {
    const meta = await this.resolveContainer(sandboxId);

    // Shell-escape each argument to prevent command injection
    const escapedArgs =
      args && args.length > 0 ? args.map((a) => shellQuote(a)).join(" ") : "";
    const fullCmd = escapedArgs
      ? `${shellQuote(cmd)} ${escapedArgs}`
      : shellQuote(cmd);

    logger.info(
      `[docker-sandbox] Executing command in ${meta.containerName}: ${cmd} ${(args ?? []).join(" ").slice(0, 80)}`,
    );

    const ssh = DockerSSHClient.getClient(
      meta.hostname,
      meta.sshPort,
      meta.hostKeyFingerprint,
      meta.sshUser,
    );
    const output = await ssh.exec(
      `docker exec ${shellQuote(meta.containerName)} ${fullCmd}`,
      DOCKER_CMD_TIMEOUT_MS,
    );

    return output;
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  /**
   * Resolve a sandboxId to its container metadata.
   *
   * Lookup order:
   * 1. In-memory registry (fast path, avoids DB call)
   * 2. Database lookup (hydrates from persisted docker metadata)
   * 3. Last resort: env-var fallback with first node (for backwards compat)
   */
  private async resolveContainer(sandboxId: string): Promise<ContainerMeta> {
    // Fast path: already tracked in memory
    const tracked = this.containers.get(sandboxId);
    if (tracked) return tracked;

    // DB lookup: hydrate from persisted metadata after restart
    try {
      const sandbox =
        await miladySandboxesRepository.findBySandboxId(sandboxId);
      if (sandbox && sandbox.node_id && sandbox.container_name) {
        // Find hostname + SSH config from DB node record or env var
        let hostname = "";
        let sshPort = DEFAULT_SSH_PORT;
        let sshUser = DEFAULT_SSH_USERNAME;
        let hostKeyFingerprint: string | undefined;

        const dbNode = await dockerNodesRepository.findByNodeId(
          sandbox.node_id,
        );
        if (dbNode) {
          hostname = dbNode.hostname;
          sshPort = dbNode.ssh_port ?? DEFAULT_SSH_PORT;
          sshUser = dbNode.ssh_user ?? DEFAULT_SSH_USERNAME;
          hostKeyFingerprint = dbNode.host_key_fingerprint ?? undefined;
        } else {
          // Try env var fallback for hostname
          const envNodes = parseDockerNodes();
          const envNode = envNodes.find((n) => n.nodeId === sandbox.node_id);
          hostname = envNode?.hostname ?? "";
        }

        if (hostname) {
          const bridgePort = sandbox.bridge_port ?? 0;
          const webUiPort = sandbox.web_ui_port ?? 0;
          if (!bridgePort || !webUiPort) {
            logger.warn(
              `[docker-sandbox] Missing port data for "${sandboxId}": bridge=${bridgePort}, webUi=${webUiPort}`,
            );
          }

          const meta: ContainerMeta = {
            nodeId: sandbox.node_id,
            hostname,
            containerName: sandbox.container_name,
            bridgePort,
            webUiPort,
            agentId: sandbox.id, // sandbox.id IS the agent ID (PK = agent identifier throughout the system)
            sshPort,
            sshUser,
            hostKeyFingerprint,
          };

          // Cache key is sandboxId which equals containerName (set in create() return value)
          this.containers.set(sandboxId, meta);
          logger.info(
            `[docker-sandbox] Hydrated container "${sandboxId}" from DB → node ${meta.nodeId} (${meta.hostname})`,
          );
          return meta;
        }
      }
    } catch (err) {
      logger.warn(
        `[docker-sandbox] DB lookup failed for container "${sandboxId}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Last resort: container not found
    throw new Error(
      `[docker-sandbox] Container "${sandboxId}" not found in memory or DB. Cannot resolve target node.`,
    );
  }
}

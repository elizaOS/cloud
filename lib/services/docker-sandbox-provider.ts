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
import { milaidySandboxesRepository } from "@/db/repositories/milaidy-sandboxes";
import { logger } from "@/lib/utils/logger";
import type { SandboxProvider, SandboxHandle, SandboxCreateConfig } from "./sandbox-provider";
import { headscaleIntegration } from "./headscale-integration";

// ---------------------------------------------------------------------------
// Exported metadata type for strongly-typed provider metadata
// ---------------------------------------------------------------------------

/** Typed metadata returned by DockerSandboxProvider in SandboxHandle.metadata */
export interface DockerSandboxMetadata {
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

interface DockerNodeEnv {
  nodeId: string;
  hostname: string;
  capacity: number;
}

interface ContainerMeta {
  nodeId: string;
  hostname: string;
  containerName: string;
  bridgePort: number;
  webUiPort: number;
  agentId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DOCKER_IMAGE =
  process.env.MILAIDY_DOCKER_IMAGE || "milady/agent:cloud-full-ui";

/** Min/max for random port allocation. */
const BRIDGE_PORT_MIN = 18790;
const BRIDGE_PORT_MAX = 19790;
const WEBUI_PORT_MIN = 20000;
const WEBUI_PORT_MAX = 25000;

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
 * Shell-escape a single value by wrapping in single-quotes and escaping
 * embedded single-quotes.
 */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

/**
 * Generate a deterministic container name from an agent ID.
 * Uses the full agentId to avoid collisions (truncated UUIDs share prefix
 * patterns and can collide on the same node).
 */
function getContainerName(agentId: string): string {
  return `milady-${agentId}`;
}

/** Volume path on the Docker host for persistent agent data. */
function getVolumePath(agentId: string): string {
  validateAgentId(agentId);
  return `/data/agents/${agentId}`;
}

/** Allocate a random port in [min, max) that is not in the excluded set. */
function allocatePort(min: number, max: number, excluded: Set<number>): number {
  const range = max - min;
  if (excluded.size >= range) {
    throw new Error(
      `[docker-sandbox] No available ports in range [${min}, ${max}). All ${range} ports are allocated.`,
    );
  }
  let port: number;
  let attempts = 0;
  do {
    port = min + Math.floor(Math.random() * range);
    attempts++;
    if (attempts > range * 2) {
      throw new Error(
        `[docker-sandbox] Failed to find an available port in range [${min}, ${max}) after ${attempts} attempts.`,
      );
    }
  } while (excluded.has(port));
  return port;
}

/** Validate an agent name: alphanumeric, hyphens, underscores only (1-64 chars). */
function validateAgentName(name: string): void {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) {
    throw new Error(
      `Invalid agent name "${name}": must be 1-64 chars, alphanumeric / hyphens / underscores only.`,
    );
  }
}

/**
 * Validate an agent ID before using it in shell commands.
 * Must be a UUID (hex + hyphens) or alphanumeric with hyphens/underscores.
 */
function validateAgentId(agentId: string): void {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(agentId)) {
    throw new Error(
      `Invalid agent ID "${agentId}": must be 1-128 chars, alphanumeric / hyphens / underscores only.`,
    );
  }
}

/**
 * Parse the `MILAIDY_DOCKER_NODES` env var.
 * Format: `nodeId:hostname:capacity,nodeId2:hostname2:capacity2`
 *
 * Result is cached at module level to avoid re-parsing on every call.
 */
let _cachedDockerNodes: DockerNodeEnv[] | null = null;
let _cachedDockerNodesRaw: string | undefined;

function parseDockerNodes(): DockerNodeEnv[] {
  const raw = process.env.MILAIDY_DOCKER_NODES;
  if (!raw) {
    throw new Error(
      "[docker-sandbox] MILAIDY_DOCKER_NODES env var is not set. " +
        'Expected format: "nodeId:hostname:capacity,..."',
    );
  }

  // Return cached result if env var hasn't changed
  if (_cachedDockerNodes && _cachedDockerNodesRaw === raw) {
    return _cachedDockerNodes;
  }

  const nodes: DockerNodeEnv[] = [];
  for (const segment of raw.split(",")) {
    const trimmed = segment.trim();
    if (!trimmed) continue;

    const parts = trimmed.split(":");
    if (parts.length < 3) {
      logger.warn(
        `[docker-sandbox] Skipping malformed node entry: "${trimmed}"`,
      );
      continue;
    }

    const [nodeId, hostname, capacityStr] = parts;
    const capacity = parseInt(capacityStr!, 10);
    if (!nodeId || !hostname || isNaN(capacity) || capacity <= 0) {
      logger.warn(
        `[docker-sandbox] Skipping invalid node entry: "${trimmed}"`,
      );
      continue;
    }

    nodes.push({ nodeId, hostname, capacity });
  }

  if (nodes.length === 0) {
    throw new Error(
      "[docker-sandbox] No valid nodes parsed from MILAIDY_DOCKER_NODES",
    );
  }

  _cachedDockerNodes = nodes;
  _cachedDockerNodesRaw = raw;
  return nodes;
}

/**
 * Get the set of ports currently allocated on a specific node.
 * Queries the DB for active sandboxes on that node.
 */
async function getUsedPorts(nodeId: string): Promise<Set<number>> {
  const used = new Set<number>();
  try {
    const sandboxes = await milaidySandboxesRepository.listByNodeId(nodeId);
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
   * In-memory registry of active containers so we can map a sandboxId back
   * to the node / container it lives on. The DB is the canonical record;
   * this cache avoids DB lookups on hot paths. On restart, resolveContainer()
   * falls back to DB lookup.
   */
  private containers = new Map<string, ContainerMeta>();

  // ------------------------------------------------------------------
  // create
  // ------------------------------------------------------------------

  async create(config: SandboxCreateConfig): Promise<SandboxHandle> {
    const { agentId, agentName, environmentVars } = config;

    // 1. Input validation
    validateAgentName(agentName);
    validateAgentId(agentId);

    // 2. Select target node via DockerNodeManager (least-loaded, DB-backed)
    const dbNode = await dockerNodeManager.getAvailableNode();

    let nodeId: string;
    let hostname: string;

    if (dbNode) {
      nodeId = dbNode.node_id;
      hostname = dbNode.hostname;
      // Increment allocated_count in DB
      await dockerNodesRepository.incrementAllocated(nodeId);
    } else {
      // Fallback to env-var parsing if DB has no nodes registered
      logger.warn(
        "[docker-sandbox] No nodes in DB, falling back to MILAIDY_DOCKER_NODES env var",
      );
      const envNodes = parseDockerNodes();
      const envNode = envNodes[Math.floor(Math.random() * envNodes.length)]!;
      nodeId = envNode.nodeId;
      hostname = envNode.hostname;
    }

    logger.info(
      `[docker-sandbox] Creating container for agent ${agentId} on node ${nodeId} (${hostname})`,
    );

    // 3. Allocate ports (check DB for existing assignments to avoid collisions)
    const usedPorts = await getUsedPorts(nodeId);
    const bridgePort = allocatePort(BRIDGE_PORT_MIN, BRIDGE_PORT_MAX, usedPorts);
    usedPorts.add(bridgePort);
    const webUiPort = allocatePort(WEBUI_PORT_MIN, WEBUI_PORT_MAX, usedPorts);
    const containerName = getContainerName(agentId);
    const volumePath = getVolumePath(agentId);

    // 4. Optionally prepare Headscale VPN
    const headscaleEnabled = !!process.env.HEADSCALE_API_KEY;
    let headscaleIp: string | null = null;

    if (headscaleEnabled) {
      try {
        const vpnSetup = await headscaleIntegration.prepareContainerVPN(agentId);
        Object.assign(environmentVars, vpnSetup.envVars);
        logger.info(
          `[docker-sandbox] Headscale VPN enabled for ${agentId}`,
        );
      } catch (err) {
        logger.warn(
          `[docker-sandbox] Headscale VPN preparation failed for ${agentId}: ${err instanceof Error ? err.message : String(err)}`,
        );
        // Continue without VPN — not a critical failure
      }
    }

    // 5. Build environment flags
    const allEnv: Record<string, string> = {
      ...environmentVars,
      AGENT_NAME: agentName,
      PORT: "2138",
      BRIDGE_PORT: "31337",
    };

    const envFlags = Object.entries(allEnv)
      .map(([key, value]) => `-e ${shellQuote(`${key}=${value}`)}`)
      .join(" ");

    // 6. Build docker run command
    const dockerRunCmd = [
      "docker run -d",
      `--name ${shellQuote(containerName)}`,
      "--restart unless-stopped",
      "--cap-add=NET_ADMIN",
      "--device /dev/net/tun",
      `-v ${shellQuote(volumePath)}:/app/data`,
      `-p ${bridgePort}:31337`,
      `-p ${webUiPort}:2138`,
      envFlags,
      shellQuote(DOCKER_IMAGE),
    ].join(" ");

    // 7. SSH to node, ensure volume dir, pull image, run container
    const ssh = DockerSSHClient.getClient(hostname);

    try {
      // Ensure volume directory exists
      await ssh.exec(`mkdir -p ${shellQuote(volumePath)}`, DOCKER_CMD_TIMEOUT_MS);

      // Pull image (may take a while on first run)
      logger.info(
        `[docker-sandbox] Pulling image ${DOCKER_IMAGE} on ${nodeId}`,
      );
      try {
        await ssh.exec(`docker pull ${shellQuote(DOCKER_IMAGE)}`, PULL_TIMEOUT_MS);
        logger.info(
          `[docker-sandbox] Image pulled successfully on ${nodeId}`,
        );
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
      throw new Error(
        `[docker-sandbox] Failed to create container on ${nodeId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // 8. Wait for Headscale VPN registration if enabled
    if (headscaleEnabled) {
      try {
        headscaleIp = await headscaleIntegration.waitForVPNRegistration(agentId, 60_000);
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

    // 9. Store metadata in in-memory cache
    const meta: ContainerMeta = {
      nodeId,
      hostname,
      containerName,
      bridgePort,
      webUiPort,
      agentId,
    };
    this.containers.set(containerName, meta);

    // 10. Return handle with strongly-typed metadata
    const targetHost = headscaleIp || hostname;

    const metadata: DockerSandboxMetadata = {
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

    const ssh = DockerSSHClient.getClient(meta.hostname);

    try {
      // Graceful stop with 10s timeout, then force-remove
      await ssh.exec(
        `docker stop -t 10 ${shellQuote(meta.containerName)}`,
        DOCKER_CMD_TIMEOUT_MS,
      );
      logger.info(
        `[docker-sandbox] Container stopped: ${meta.containerName}`,
      );
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
      logger.info(
        `[docker-sandbox] Container removed: ${meta.containerName}`,
      );
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
      await headscaleIntegration.cleanupContainerVPN(meta.agentId).catch((err) => {
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
      } else {
        break;
      }
    }

    logger.warn(`[docker-sandbox] Health check timed out after ${HEALTH_CHECK_TIMEOUT_MS / 1000}s: ${url}`);
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
    const escapedArgs = args && args.length > 0
      ? args.map((a) => shellQuote(a)).join(" ")
      : "";
    const fullCmd = escapedArgs ? `${shellQuote(cmd)} ${escapedArgs}` : shellQuote(cmd);

    logger.info(
      `[docker-sandbox] Executing command in ${meta.containerName}: ${cmd} ${(args ?? []).join(" ").slice(0, 80)}`,
    );

    const ssh = DockerSSHClient.getClient(meta.hostname);
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
      const sandbox = await milaidySandboxesRepository.findBySandboxId(sandboxId);
      if (sandbox && sandbox.node_id && sandbox.container_name) {
        // Find hostname from DB node record or env var
        let hostname = "";
        const dbNode = await dockerNodesRepository.findByNodeId(sandbox.node_id);
        if (dbNode) {
          hostname = dbNode.hostname;
        } else {
          // Try env var fallback for hostname
          const envNodes = parseDockerNodes();
          const envNode = envNodes.find((n) => n.nodeId === sandbox.node_id);
          hostname = envNode?.hostname ?? "";
        }

        if (hostname) {
          const meta: ContainerMeta = {
            nodeId: sandbox.node_id,
            hostname,
            containerName: sandbox.container_name,
            bridgePort: sandbox.bridge_port ?? 0,
            webUiPort: sandbox.web_ui_port ?? 0,
            agentId: sandbox.id,
          };

          // Cache for next time
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

    // Last resort: env-var fallback (preserves backwards compat)
    const nodes = parseDockerNodes();
    const node = nodes[0]!;

    logger.warn(
      `[docker-sandbox] Container "${sandboxId}" not found in memory or DB, falling back to first node (${node.nodeId})`,
    );

    return {
      nodeId: node.nodeId,
      hostname: node.hostname,
      containerName: sandboxId,
      bridgePort: 0,
      webUiPort: 0,
      agentId: "",
    };
  }
}

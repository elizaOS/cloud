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
import { logger } from "@/lib/utils/logger";
import type { SandboxProvider, SandboxHandle, SandboxCreateConfig } from "./sandbox-provider";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface DockerNode {
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

/** Health-check HTTP timeout (ms). */
const HEALTH_CHECK_TIMEOUT_MS = 8_000;

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
 * Uses the first 8 characters of the agentId.
 */
function getContainerName(agentId: string): string {
  return `milady-${agentId.slice(0, 8)}`;
}

/** Volume path on the Docker host for persistent agent data. */
function getVolumePath(agentId: string): string {
  return `/data/agents/${agentId}`;
}

/** Allocate a random port in [min, max). */
function randomPort(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min));
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
 * Parse the `MILAIDY_DOCKER_NODES` env var.
 * Format: `nodeId:hostname:capacity,nodeId2:hostname2:capacity2`
 */
function parseDockerNodes(): DockerNode[] {
  const raw = process.env.MILAIDY_DOCKER_NODES;
  if (!raw) {
    throw new Error(
      "[docker-sandbox] MILAIDY_DOCKER_NODES env var is not set. " +
        'Expected format: "nodeId:hostname:capacity,..."',
    );
  }

  const nodes: DockerNode[] = [];
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

  return nodes;
}

// ---------------------------------------------------------------------------
// DockerSandboxProvider
// ---------------------------------------------------------------------------

export class DockerSandboxProvider implements SandboxProvider {
  /**
   * In-memory registry of active containers so we can map a sandboxId back
   * to the node / container it lives on.  In a production deployment this
   * would be persisted to the database, but for the provider layer an
   * in-memory map is sufficient (the DB layer above us keeps the canonical
   * record).
   */
  private containers = new Map<string, ContainerMeta>();

  // ------------------------------------------------------------------
  // create
  // ------------------------------------------------------------------

  async create(config: SandboxCreateConfig): Promise<SandboxHandle> {
    const { agentId, agentName, environmentVars } = config;

    // 1. Input validation
    validateAgentName(agentName);

    // 2. Select target node (simple random selection for now)
    const nodes = parseDockerNodes();
    const node = nodes[Math.floor(Math.random() * nodes.length)]!;

    logger.info(
      `[docker-sandbox] Creating container for agent ${agentId} on node ${node.nodeId} (${node.hostname})`,
    );

    // 3. Allocate ports
    const bridgePort = randomPort(BRIDGE_PORT_MIN, BRIDGE_PORT_MAX);
    const webUiPort = randomPort(WEBUI_PORT_MIN, WEBUI_PORT_MAX);
    const containerName = getContainerName(agentId);
    const volumePath = getVolumePath(agentId);

    // 4. Build environment flags
    const allEnv: Record<string, string> = {
      ...environmentVars,
      AGENT_NAME: agentName,
      PORT: "2138",
      BRIDGE_PORT: "31337",
    };

    const envFlags = Object.entries(allEnv)
      .map(([key, value]) => `-e ${shellQuote(`${key}=${value}`)}`)
      .join(" ");

    // 5. Build docker run command
    const dockerRunCmd = [
      "docker run -d",
      `--name ${containerName}`,
      "--restart unless-stopped",
      "--cap-add=NET_ADMIN",
      "--device /dev/net/tun",
      `-v ${volumePath}:/app/data`,
      `-p ${bridgePort}:31337`,
      `-p ${webUiPort}:2138`,
      envFlags,
      DOCKER_IMAGE,
    ].join(" ");

    // 6. SSH to node, ensure volume dir, pull image, run container
    const ssh = DockerSSHClient.getClient(node.hostname);

    try {
      // Ensure volume directory exists
      await ssh.exec(`mkdir -p ${volumePath}`, DOCKER_CMD_TIMEOUT_MS);

      // Pull image (may take a while on first run)
      logger.info(
        `[docker-sandbox] Pulling image ${DOCKER_IMAGE} on ${node.nodeId}`,
      );
      try {
        await ssh.exec(`docker pull ${DOCKER_IMAGE}`, PULL_TIMEOUT_MS);
        logger.info(
          `[docker-sandbox] Image pulled successfully on ${node.nodeId}`,
        );
      } catch (pullErr) {
        logger.warn(
          `[docker-sandbox] Image pull failed on ${node.nodeId} (will use cached): ${pullErr instanceof Error ? pullErr.message : String(pullErr)}`,
        );
      }

      // Run container
      const output = await ssh.exec(dockerRunCmd, DOCKER_CMD_TIMEOUT_MS);
      const containerId = output.trim().slice(0, 12);
      logger.info(
        `[docker-sandbox] Container created on ${node.nodeId}: ${containerId} (${containerName})`,
      );
    } catch (err) {
      throw new Error(
        `[docker-sandbox] Failed to create container on ${node.nodeId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // 7. Store metadata
    const meta: ContainerMeta = {
      nodeId: node.nodeId,
      hostname: node.hostname,
      containerName,
      bridgePort,
      webUiPort,
      agentId,
    };
    this.containers.set(containerName, meta);

    // 8. Return handle
    return {
      sandboxId: containerName,
      bridgeUrl: `http://${node.hostname}:${bridgePort}`,
      healthUrl: `http://${node.hostname}:${webUiPort}`,
      metadata: {
        nodeId: node.nodeId,
        hostname: node.hostname,
        containerName,
        bridgePort,
        webUiPort,
        agentId,
        volumePath,
      },
    };
  }

  // ------------------------------------------------------------------
  // stop
  // ------------------------------------------------------------------

  async stop(sandboxId: string): Promise<void> {
    const meta = this.resolveContainer(sandboxId);

    logger.info(
      `[docker-sandbox] Stopping container ${meta.containerName} on ${meta.nodeId} (${meta.hostname})`,
    );

    const ssh = DockerSSHClient.getClient(meta.hostname);

    try {
      // Graceful stop with 10s timeout, then force-remove
      await ssh.exec(
        `docker stop -t 10 ${meta.containerName}`,
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
        `docker rm -f ${meta.containerName}`,
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

    // Remove from in-memory registry
    this.containers.delete(meta.containerName);
  }

  // ------------------------------------------------------------------
  // checkHealth
  // ------------------------------------------------------------------

  async checkHealth(healthUrl: string): Promise<boolean> {
    const url = healthUrl.replace(/\/$/, "") + "/health";

    try {
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        HEALTH_CHECK_TIMEOUT_MS,
      );

      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timer);
      return response.ok;
    } catch {
      return false;
    }
  }

  // ------------------------------------------------------------------
  // runCommand
  // ------------------------------------------------------------------

  async runCommand(
    sandboxId: string,
    cmd: string,
    args?: string[],
  ): Promise<string> {
    const meta = this.resolveContainer(sandboxId);

    const fullCmd = args && args.length > 0 ? `${cmd} ${args.join(" ")}` : cmd;

    logger.info(
      `[docker-sandbox] Executing command in ${meta.containerName}: ${fullCmd.slice(0, 120)}`,
    );

    const ssh = DockerSSHClient.getClient(meta.hostname);
    const output = await ssh.exec(
      `docker exec ${meta.containerName} ${fullCmd}`,
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
   * 1. In-memory registry (fast path)
   * 2. Treat sandboxId as container name, infer node from env
   */
  private resolveContainer(sandboxId: string): ContainerMeta {
    // Fast path: already tracked
    const tracked = this.containers.get(sandboxId);
    if (tracked) return tracked;

    // Fallback: assume sandboxId IS the container name and infer
    // the node from the env var.  Pick the first node.
    const nodes = parseDockerNodes();
    const node = nodes[0]!;

    logger.warn(
      `[docker-sandbox] Container "${sandboxId}" not in registry, falling back to first node (${node.nodeId})`,
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

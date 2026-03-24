/**
 * DockerSandboxProvider — SandboxProvider implementation for Docker containers
 * on remote VPS nodes.
 *
 * Manages the full lifecycle: create (pull image + docker run), stop/remove,
 * health-check, and arbitrary command execution inside containers.
 *
 * Reference: milady-cloud/backend/services/container-orchestrator.ts
 */

import { dockerNodesRepository } from "@/db/repositories/docker-nodes";
import { miladySandboxesRepository } from "@/db/repositories/milady-sandboxes";
import { getAgentBaseDomain } from "@/lib/milady-web-ui";
import { dockerNodeManager } from "@/lib/services/docker-node-manager";
import { DockerSSHClient } from "@/lib/services/docker-ssh";
import { logger } from "@/lib/utils/logger";
import {
  allocatePort,
  BRIDGE_PORT_MAX,
  BRIDGE_PORT_MIN,
  extractDockerCreateContainerId,
  getContainerName,
  getVolumePath,
  parseDockerNodes,
  requiresDockerHostGateway,
  resolveStewardContainerUrl,
  shellQuote,
  validateAgentId,
  validateAgentName,
  validateEnvKey,
  validateEnvValue,
  WEBUI_PORT_MAX,
  WEBUI_PORT_MIN,
} from "./docker-sandbox-utils";
import { headscaleIntegration } from "./headscale-integration";
import type { SandboxCreateConfig, SandboxHandle, SandboxProvider } from "./sandbox-provider";

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

const DOCKER_IMAGE = process.env.MILADY_DOCKER_IMAGE || "ghcr.io/milady-ai/agent:v2.0.0-steward-5";
const DOCKER_NETWORK = process.env.MILADY_DOCKER_NETWORK || "milady-isolated";
// URL for host-side Steward API calls (registration, token minting).
// The orchestrator (or SSH-executed scripts on the Docker host) can reach Steward via localhost.
const STEWARD_HOST_URL = process.env.STEWARD_API_URL || "http://localhost:3200";

// URL injected into container env vars. Containers on the bridge network (milady-isolated)
// cannot reach the host via localhost. On Linux we pair host.docker.internal with an
// explicit host-gateway alias in docker create so the same default works cross-platform.
const STEWARD_CONTAINER_URL = resolveStewardContainerUrl(
  STEWARD_HOST_URL,
  process.env.STEWARD_CONTAINER_URL,
);
const DEFAULT_MILADY_PORT = process.env.MILADY_CONTAINER_PORT || "2138";
const DEFAULT_AGENT_PORT = process.env.MILADY_AGENT_PORT || "2139";
const DEFAULT_BRIDGE_PORT = process.env.MILADY_BRIDGE_INTERNAL_PORT || "31337";

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

function getDockerHealthCmd(port: string): string {
  if (!/^\d+$/.test(port)) {
    throw new Error(`[docker-sandbox] Invalid port "${port}": must be a numeric string.`);
  }
  return `sh -lc 'wget -qO- "http://127.0.0.1:${port}/health" >/dev/null 2>&1 || curl -fsS "http://127.0.0.1:${port}/health" >/dev/null 2>&1'`;
}

function extractStewardToken(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("[docker-sandbox] Steward token endpoint returned an empty response");
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;

    // Steward API returns { token: "..." }. Keep one fallback for agentToken
    // in case an older Steward build uses that field name.
    const candidate = parsed.token ?? parsed.agentToken;

    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  } catch {
    // Some Steward builds may return the token as plain text.
  }

  // Sanity check: reject responses that look like HTML error pages or are
  // unreasonably long (e.g. a full HTML document instead of a token).
  if (trimmed.length > 2048) {
    throw new Error(
      "[docker-sandbox] Steward token response exceeds 2048 chars — likely not a valid token",
    );
  }
  if (trimmed.includes("<") || trimmed.includes(">")) {
    throw new Error(
      "[docker-sandbox] Steward token response contains HTML markers — likely an error page",
    );
  }
  if (/\s/.test(trimmed)) {
    throw new Error(
      "[docker-sandbox] Steward token response contains whitespace — likely not a valid token",
    );
  }

  logger.warn(
    "[docker-sandbox] Steward token response was plain text instead of JSON; accepting legacy fallback",
  );
  return trimmed;
}

async function registerAgentWithSteward(
  ssh: DockerSSHClient,
  agentId: string,
  agentName: string,
): Promise<string> {
  const script = `python3 - <<'PY'
import json
import sys
import urllib.error
import urllib.request

base_url = ${JSON.stringify(STEWARD_HOST_URL)}
agent_id = ${JSON.stringify(agentId)}
agent_name = ${JSON.stringify(agentName)}


def post(path, payload):
    req = urllib.request.Request(
        f"{base_url}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            return response.status, response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode("utf-8")


status, body = post("/agents", {"id": agent_id, "name": agent_name})
if status not in (200, 201, 202, 409):
    print(body, file=sys.stderr)
    raise SystemExit(f"Steward agent registration failed with status {status}")

status, body = post(f"/agents/{agent_id}/token", {"name": "milady-cloud"})
if status not in (200, 201):
    print(body, file=sys.stderr)
    raise SystemExit(f"Steward token mint failed with status {status}")

print(body)
PY`;

  const rawToken = await ssh.exec(script, DOCKER_CMD_TIMEOUT_MS);
  return extractStewardToken(rawToken);
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
    throw lastError ?? new Error("[docker-sandbox] create exhausted all retry attempts");
  }

  /**
   * Create a single sandbox container (no retry).
   *
   * TOCTOU note: Port allocation is racy under concurrent provisioning.
   * The DB has a partial UNIQUE index on (node_id, bridge_port) for active
   * sandboxes, so a duplicate will fail at INSERT time. The public `create()`
   * method wraps this in a retry loop to handle port collisions automatically.
   */
  private async _createOnce(config: SandboxCreateConfig): Promise<SandboxHandle> {
    const { agentId, agentName, environmentVars } = config;

    // Resolve Docker image: explicit config > env var > hardcoded default
    const resolvedImage = config.dockerImage || DOCKER_IMAGE;

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
    const bridgePort = allocatePort(BRIDGE_PORT_MIN, BRIDGE_PORT_MAX, usedPorts);
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
        const vpnSetup = await headscaleIntegration.prepareContainerVPN(agentId);
        vpnEnvVars = vpnSetup.envVars;
        logger.info(`[docker-sandbox] Headscale VPN enabled for ${agentId}`);
      } catch (err) {
        logger.warn(
          `[docker-sandbox] Headscale VPN preparation failed for ${agentId}: ${err instanceof Error ? err.message : String(err)}`,
        );
        // Continue without VPN — not a critical failure
      }
    }

    // 5. Build the base environment (spread to avoid mutating caller's environmentVars)
    const baseEnv: Record<string, string> = {
      ...environmentVars,
      ...vpnEnvVars,
      AGENT_NAME: agentName,
      MILADY_CLOUD_PROVISIONED: "1",
      ELIZA_CLOUD_PROVISIONED: "1",
      STEWARD_API_URL: STEWARD_CONTAINER_URL,
      STEWARD_AGENT_ID: agentId,
      // steward-enabled image runs two processes:
      //   milady.mjs (UI)   on MILADY_PORT (default 2138)
      //   cloud-agent       on PORT        (default 2139)
      // Do NOT set PORT=2138 here — it would collide with MILADY_PORT
      // and the API service would steal the UI port.
      MILADY_PORT: DEFAULT_MILADY_PORT,
      PORT: DEFAULT_AGENT_PORT,
      BRIDGE_PORT: DEFAULT_BRIDGE_PORT,
      // Eliza server requires JWT_SECRET in production mode.
      // Generate a unique per-container secret if the caller didn't provide one.
      JWT_SECRET: environmentVars.JWT_SECRET || crypto.randomUUID(),
      // The milady server auto-generates a random MILADY_API_TOKEN when
      // MILADY_API_BIND is non-loopback (0.0.0.0) and no token is set.
      // Set it explicitly so our pairing endpoint can return it.
      // IMPORTANT: use a separate random value — do NOT reuse JWT_SECRET,
      // which is the container's auth signing key.
      MILADY_API_TOKEN: environmentVars.MILADY_API_TOKEN || crypto.randomUUID(),
      // Allow the agent subdomain origin so the browser can call the API.
      MILADY_ALLOWED_ORIGINS: `https://${agentId}.${getAgentBaseDomain()}`,
    };

    // 6. SSH to node, ensure volume dir, pull image, register in Steward,
    // then create/start the container. Pass hostKeyFingerprint so pooled
    // clients pin the key when available.
    const ssh = DockerSSHClient.getClient(hostname, sshPort, hostKeyFingerprint, sshUser);

    try {
      // Ensure volume directory exists
      await ssh.exec(`mkdir -p ${shellQuote(volumePath)}`, DOCKER_CMD_TIMEOUT_MS);

      // Pull image (may take a while on first run)
      logger.info(`[docker-sandbox] Pulling image ${resolvedImage} on ${nodeId}`);
      try {
        await ssh.exec(`docker pull ${shellQuote(resolvedImage)}`, PULL_TIMEOUT_MS);
        logger.info(`[docker-sandbox] Image pulled successfully on ${nodeId}`);
      } catch (pullErr) {
        logger.warn(
          `[docker-sandbox] Image pull failed on ${nodeId} (will use cached): ${pullErr instanceof Error ? pullErr.message : String(pullErr)}`,
        );
      }

      logger.info(`[docker-sandbox] Registering ${agentId} with Steward on ${nodeId}`);
      const stewardAgentToken = await registerAgentWithSteward(ssh, agentId, agentName);

      const allEnv: Record<string, string> = {
        ...baseEnv,
        STEWARD_AGENT_TOKEN: stewardAgentToken,
      };

      // Validate env keys/values before they are interpolated into remote shell commands.
      // Internal env vars must also remain UPPER_SNAKE_CASE so validation stays
      // consistent across caller-supplied and provider-generated values.
      for (const [key, value] of Object.entries(allEnv)) {
        validateEnvKey(key);
        validateEnvValue(key, value);
      }

      const envFlags = Object.entries(allEnv)
        .map(([key, value]) => `-e ${shellQuote(`${key}=${value}`)}`)
        .join(" ");

      const dockerCreateCmd = [
        "docker create",
        `--name ${shellQuote(containerName)}`,
        "--restart unless-stopped",
        `--network ${shellQuote(DOCKER_NETWORK)}`,
        ...(requiresDockerHostGateway(STEWARD_CONTAINER_URL)
          ? ["--add-host host.docker.internal:host-gateway"]
          : []),
        `--health-cmd ${shellQuote(getDockerHealthCmd(allEnv.MILADY_PORT || DEFAULT_MILADY_PORT))}`,
        "--health-interval 10s",
        "--health-timeout 5s",
        "--health-start-period 15s",
        "--health-retries 6",
        ...(headscaleEnabled ? ["--cap-add=NET_ADMIN", "--device /dev/net/tun"] : []),
        `-v ${shellQuote(volumePath)}:/app/data`,
        `-p ${bridgePort}:${DEFAULT_BRIDGE_PORT}`,
        `-p ${webUiPort}:${allEnv.MILADY_PORT || DEFAULT_MILADY_PORT}`,
        envFlags,
        shellQuote(resolvedImage),
      ].join(" ");

      const containerId = extractDockerCreateContainerId(
        await ssh.exec(dockerCreateCmd, DOCKER_CMD_TIMEOUT_MS),
      );
      await ssh.exec(`docker start ${shellQuote(containerName)}`, DOCKER_CMD_TIMEOUT_MS);
      logger.info(
        `[docker-sandbox] Container created on ${nodeId}: ${containerId} (${containerName})`,
      );
    } catch (err) {
      // Best-effort Steward deregistration — the agent was registered but the
      // container failed to start, so we try to clean up the Steward record.
      try {
        await ssh.exec(
          `curl -s -X DELETE ${shellQuote(`${STEWARD_HOST_URL}/agents/${agentId}`)} || true`,
          DOCKER_CMD_TIMEOUT_MS,
        );
        logger.info(`[docker-sandbox] Cleaned up Steward agent ${agentId} after container failure`);
      } catch (cleanupErr) {
        logger.warn(
          `[docker-sandbox] Failed to cleanup Steward agent ${agentId}: ${cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)}`,
        );
      }

      await ssh
        .exec(`docker rm -f ${shellQuote(containerName)}`, DOCKER_CMD_TIMEOUT_MS)
        .catch(() => {});

      // Rollback allocated_count on failure
      if (dbNode) {
        await dockerNodesRepository.decrementAllocated(nodeId).catch(() => {});
      }
      // Clean up Headscale pre-auth key if VPN was prepared
      if (headscaleEnabled) {
        await headscaleIntegration.cleanupContainerVPN(agentId).catch((cleanupErr) => {
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
      dockerImage: resolvedImage,
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
      await ssh.exec(`docker stop -t 10 ${shellQuote(meta.containerName)}`, DOCKER_CMD_TIMEOUT_MS);
      logger.info(`[docker-sandbox] Container stopped: ${meta.containerName}`);
    } catch (stopErr) {
      logger.warn(
        `[docker-sandbox] docker stop failed for ${meta.containerName}: ${stopErr instanceof Error ? stopErr.message : String(stopErr)}`,
      );
    }

    try {
      await ssh.exec(`docker rm -f ${shellQuote(meta.containerName)}`, DOCKER_CMD_TIMEOUT_MS);
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

        logger.debug(`[docker-sandbox] Health check returned ${response.status}, retrying...`);
      } catch {
        // Connection refused, timeout, etc. — expected while container boots
      }

      // Wait before retrying (but don't overshoot the deadline)
      const remaining = deadline - Date.now();
      if (remaining > HEALTH_CHECK_POLL_INTERVAL_MS) {
        await new Promise((resolve) => setTimeout(resolve, HEALTH_CHECK_POLL_INTERVAL_MS));
      } else if (remaining > 0) {
        // One last attempt after a short wait
        await new Promise((resolve) => setTimeout(resolve, Math.min(remaining, 1000)));
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

  async runCommand(sandboxId: string, cmd: string, args?: string[]): Promise<string> {
    const meta = await this.resolveContainer(sandboxId);

    // Shell-escape each argument to prevent command injection
    const escapedArgs = args && args.length > 0 ? args.map((a) => shellQuote(a)).join(" ") : "";
    const fullCmd = escapedArgs ? `${shellQuote(cmd)} ${escapedArgs}` : shellQuote(cmd);

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
      const sandbox = await miladySandboxesRepository.findBySandboxId(sandboxId);
      if (sandbox && sandbox.node_id && sandbox.container_name) {
        // Find hostname + SSH config from DB node record or env var
        let hostname = "";
        let sshPort = DEFAULT_SSH_PORT;
        let sshUser = DEFAULT_SSH_USERNAME;
        let hostKeyFingerprint: string | undefined;

        const dbNode = await dockerNodesRepository.findByNodeId(sandbox.node_id);
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

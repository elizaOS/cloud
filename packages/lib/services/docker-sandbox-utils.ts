/**
 * Docker Sandbox Utilities
 *
 * Pure utility functions extracted from DockerSandboxProvider for reusability
 * and testability. These functions handle shell quoting, validation, port
 * allocation, and node configuration parsing.
 */

import { logger } from "@/lib/utils/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DockerNodeEnv {
  nodeId: string;
  hostname: string;
  capacity: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const BRIDGE_PORT_MIN = 18790;
export const BRIDGE_PORT_MAX = 19790;
export const WEBUI_PORT_MIN = 20000;
export const WEBUI_PORT_MAX = 25000;
export const DOCKER_CONTAINER_NAME_MAX_LENGTH = 128;
export const MILADY_CONTAINER_NAME_PREFIX = "milady-";
export const MAX_AGENT_ID_LENGTH =
  DOCKER_CONTAINER_NAME_MAX_LENGTH - MILADY_CONTAINER_NAME_PREFIX.length;

// ---------------------------------------------------------------------------
// Shell Quoting
// ---------------------------------------------------------------------------

/**
 * Shell-escape a single value by wrapping in single-quotes and escaping
 * embedded single-quotes.
 */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function hasControlChars(value: string): boolean {
  return /[\x00-\x1f\x7f]/.test(value);
}

/**
 * Validate an agent ID before using it in Docker-derived names and shell commands.
 * Must fit within Docker's 128-char container name limit after the `milady-`
 * prefix is applied.
 */
export function validateAgentId(agentId: string): void {
  if (
    agentId.length === 0 ||
    agentId.length > MAX_AGENT_ID_LENGTH ||
    hasControlChars(agentId) ||
    !/^[a-zA-Z0-9_-]+$/.test(agentId)
  ) {
    throw new Error(
      `Invalid agent ID "${agentId}": must be 1-${MAX_AGENT_ID_LENGTH} chars, alphanumeric / hyphens / underscores only.`,
    );
  }
}

/** Validate an agent name: printable characters, 1-64 chars, no shell metacharacters. */
export function validateAgentName(name: string): void {
  if (!name || name.length > 64) {
    throw new Error(`Invalid agent name: must be 1-64 characters.`);
  }
  // Block characters that could break shell commands even inside quotes
  if (/[\x00-\x1f\x7f]/.test(name)) {
    throw new Error(`Invalid agent name "${name}": contains control characters.`);
  }
}

/** Env keys must be uppercase shell-safe identifiers; lowercase keys are intentionally rejected. */
export function validateEnvKey(key: string): void {
  if (hasControlChars(key) || !/^[A-Z_][A-Z0-9_]*$/.test(key)) {
    throw new Error(
      `Invalid environment variable key "${key}": must match ^[A-Z_][A-Z0-9_]*$.`,
    );
  }
}

/**
 * Env values are shell-safe once single-quoted, but we still reject control
 * characters so multi-line payloads and invisible bytes cannot reach the remote
 * shell command. Callers should pass a key so production errors are debuggable.
 */
export function validateEnvValue(key: string, value: string): void {
  if (hasControlChars(value)) {
    throw new Error(
      `Invalid environment variable value for key "${key}": contains control characters (newlines and PEM-encoded values are not supported).`,
    );
  }
}

/** Docker container names must be simple shell-safe identifiers. */
export function validateContainerName(containerName: string): void {
  if (hasControlChars(containerName) || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(containerName)) {
    throw new Error(
      `Invalid container name "${containerName}": must match ^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$.`,
    );
  }
}

/** Docker host volume paths must be absolute, normalized, and shell-safe. */
export function validateVolumePath(volumePath: string): void {
  // First allow only absolute shell-safe path characters, reject the root path,
  // then separately enforce normalized-form rules like no traversal, repeated
  // separators, or trailing slash.
  if (
    hasControlChars(volumePath) ||
    volumePath === "/" ||
    !/^\/[A-Za-z0-9._/\-]+$/.test(volumePath)
  ) {
    throw new Error(`Invalid volume path "${volumePath}".`);
  }
  if (
    volumePath.includes("//") ||
    volumePath.includes("/./") ||
    volumePath.includes("/../") ||
    volumePath.endsWith("/.") ||
    volumePath.endsWith("/..") ||
    (volumePath.length > 1 && volumePath.endsWith("/"))
  ) {
    throw new Error(`Invalid volume path "${volumePath}": path must be normalized.`);
  }
}

// ---------------------------------------------------------------------------
// Port Allocation
// ---------------------------------------------------------------------------

/**
 * Pick a random port in [min, max) that is not in the exclusion set.
 * TOCTOU safety: the DB has a partial UNIQUE index on (node_id, bridge_port)
 * for active sandboxes, so a duplicate insert will fail and the caller
 * should retry the entire provisioning flow.
 */
export function allocatePort(min: number, max: number, excluded: Set<number>): number {
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

// ---------------------------------------------------------------------------
// Container Naming & Paths
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic container name from an agent ID.
 * Uses the full agentId to avoid collisions (truncated UUIDs share prefix
 * patterns and can collide on the same node).
 */
export function getContainerName(agentId: string): string {
  validateAgentId(agentId);
  const containerName = `${MILADY_CONTAINER_NAME_PREFIX}${agentId}`;
  // Keep this derived-output validation as a guardrail if the naming template changes.
  validateContainerName(containerName);
  return containerName;
}

/** Volume path on the Docker host for persistent agent data. */
export function getVolumePath(agentId: string): string {
  validateAgentId(agentId);
  const volumePath = `/data/agents/${agentId}`;
  validateVolumePath(volumePath);
  return volumePath;
}

// ---------------------------------------------------------------------------
// Node Configuration Parsing
// ---------------------------------------------------------------------------

/**
 * Parse the `MILADY_DOCKER_NODES` env var.
 * Format: `nodeId:hostname:capacity,nodeId2:hostname2:capacity2`
 *
 * Result is cached at module level to avoid re-parsing on every call.
 */
let _cachedDockerNodes: DockerNodeEnv[] | null = null;
let _cachedDockerNodesRaw: string | undefined;

export function parseDockerNodes(): DockerNodeEnv[] {
  const raw = process.env.MILADY_DOCKER_NODES;
  if (!raw) {
    throw new Error(
      "[docker-sandbox] MILADY_DOCKER_NODES env var is not set. " +
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
      logger.warn(`[docker-sandbox] Skipping malformed node entry: "${trimmed}"`);
      continue;
    }

    const [nodeId, hostname, capacityStr] = parts;
    const capacity = parseInt(capacityStr!, 10);
    if (!nodeId || !hostname || isNaN(capacity) || capacity <= 0) {
      logger.warn(`[docker-sandbox] Skipping invalid node entry: "${trimmed}"`);
      continue;
    }

    nodes.push({ nodeId, hostname, capacity });
  }

  if (nodes.length === 0) {
    throw new Error("[docker-sandbox] No valid nodes parsed from MILADY_DOCKER_NODES");
  }

  _cachedDockerNodes = nodes;
  _cachedDockerNodesRaw = raw;
  return nodes;
}

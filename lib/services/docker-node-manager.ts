/**
 * DockerNodeManager — Manages Docker VPS node pool for sandbox provisioning.
 *
 * Handles node selection (least-loaded), health checks, capacity reporting,
 * and allocation count synchronisation.
 *
 * Reference: milady-cloud/backend/services/node-manager.ts
 */

import { dockerNodesRepository } from "@/db/repositories/docker-nodes";
import type { DockerNode, DockerNodeStatus } from "@/db/schemas/docker-nodes";
import { DockerSSHClient } from "@/lib/services/docker-ssh";
import { logger } from "@/lib/utils/logger";
import { dbRead } from "@/db/helpers";
import { miladySandboxes, type MiladySandboxStatus } from "@/db/schemas/milady-sandboxes";
import { eq, and, sql, notInArray } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NodeCapacityReport {
  nodeId: string;
  hostname: string;
  capacity: number;
  allocated: number;
  available: number;
  status: DockerNodeStatus;
  enabled: boolean;
  lastHealthCheck: Date | null;
}

export interface CapacitySummary {
  totalCapacity: number;
  totalAllocated: number;
  totalAvailable: number;
  nodes: NodeCapacityReport[];
}

// ---------------------------------------------------------------------------
// DockerNodeManager
// ---------------------------------------------------------------------------

export class DockerNodeManager {
  private static instance: DockerNodeManager;

  private constructor() {}

  static getInstance(): DockerNodeManager {
    if (!DockerNodeManager.instance) {
      DockerNodeManager.instance = new DockerNodeManager();
    }
    return DockerNodeManager.instance;
  }

  // ---- Node Selection ---------------------------------------------------

  /**
   * Find the least-loaded healthy node with available capacity.
   * Returns null if no capacity is available.
   */
  async getAvailableNode(): Promise<DockerNode | null> {
    const node = await dockerNodesRepository.findLeastLoaded();
    if (!node) {
      logger.warn("[docker-node-manager] No available nodes with capacity");
      return null;
    }
    logger.info(
      `[docker-node-manager] Selected node ${node.node_id} (${node.allocated_count}/${node.capacity} used)`,
    );
    return node;
  }

  /**
   * Get node configuration by node_id.
   */
  async getNodeConfig(nodeId: string): Promise<DockerNode | null> {
    return dockerNodesRepository.findByNodeId(nodeId);
  }

  // ---- Health Checks ----------------------------------------------------

  /**
   * Run health checks on all enabled nodes.
   * SSH into each node, verify Docker daemon is responsive, update status.
   */
  async healthCheckAll(): Promise<Map<string, DockerNodeStatus>> {
    const nodes = await dockerNodesRepository.findEnabled();
    const results = new Map<string, DockerNodeStatus>();

    const checks = nodes.map(async (node) => {
      const status = await this.healthCheckNode(node);
      results.set(node.node_id, status);
    });

    await Promise.allSettled(checks);
    return results;
  }

  /**
   * Health-check a single node via SSH.
   * Verifies Docker daemon is running by executing `docker info --format '{{.ID}}'`.
   */
  async healthCheckNode(node: DockerNode): Promise<DockerNodeStatus> {
    let status: DockerNodeStatus = "offline";

    try {
      const ssh = DockerSSHClient.getClient(node.hostname);
      await ssh.connect();

      // Quick check: can Docker respond?
      const dockerId = await ssh.exec(
        "docker info --format '{{.ID}}'",
        10_000,
      );

      if (dockerId.trim()) {
        status = "healthy";
      } else {
        status = "degraded";
        logger.warn(
          `[docker-node-manager] Node ${node.node_id}: Docker returned empty ID`,
        );
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(
        `[docker-node-manager] Health check failed for ${node.node_id}: ${msg}`,
      );
      status = "offline";
    }

    await dockerNodesRepository.updateStatus(node.node_id, status);
    return status;
  }

  // ---- Capacity Reporting -----------------------------------------------

  /**
   * Get a full capacity report across all nodes.
   */
  async getCapacityReport(): Promise<CapacitySummary> {
    const nodes = await dockerNodesRepository.findAll();

    const nodeReports: NodeCapacityReport[] = nodes.map((node) => ({
      nodeId: node.node_id,
      hostname: node.hostname,
      capacity: node.capacity,
      allocated: node.allocated_count,
      available: node.enabled
        ? Math.max(0, node.capacity - node.allocated_count)
        : 0,
      status: node.status,
      enabled: node.enabled,
      lastHealthCheck: node.last_health_check,
    }));

    const enabledNodes = nodeReports.filter((n) => n.enabled);

    return {
      totalCapacity: enabledNodes.reduce((sum, n) => sum + n.capacity, 0),
      totalAllocated: enabledNodes.reduce((sum, n) => sum + n.allocated, 0),
      totalAvailable: enabledNodes.reduce((sum, n) => sum + n.available, 0),
      nodes: nodeReports,
    };
  }

  // ---- Allocation Sync --------------------------------------------------

  /**
   * Count actual sandbox containers per node from the database and reconcile
   * allocated_count in docker_nodes.
   *
   * Active sandboxes are those not in terminal states (stopped/error).
   */
  async syncAllocatedCounts(): Promise<Map<string, { before: number; after: number }>> {
    const nodes = await dockerNodesRepository.findEnabled();
    const changes = new Map<string, { before: number; after: number }>();

    // Count active sandboxes per node from milady_sandboxes
    const terminalStatuses: MiladySandboxStatus[] = ["stopped", "error"];

    for (const node of nodes) {
      const [result] = await dbRead
        .select({ count: sql<number>`count(*)::int` })
        .from(miladySandboxes)
        .where(
          and(
            eq(miladySandboxes.node_id, node.node_id),
            notInArray(miladySandboxes.status, terminalStatuses),
          ),
        );

      const actualCount = result?.count ?? 0;

      if (actualCount !== node.allocated_count) {
        logger.info(
          `[docker-node-manager] Sync ${node.node_id}: allocated_count ${node.allocated_count} → ${actualCount}`,
        );
        await dockerNodesRepository.setAllocatedCount(node.node_id, actualCount);
        changes.set(node.node_id, {
          before: node.allocated_count,
          after: actualCount,
        });
      }
    }

    if (changes.size > 0) {
      logger.info(
        `[docker-node-manager] Synced allocated counts for ${changes.size} node(s)`,
      );
    }

    return changes;
  }

  // ---- Runtime Container Inspection -------------------------------------

  /**
   * List running containers on a node via SSH.
   * Returns container names matching the sandbox pattern.
   */
  async getRuntimeContainers(
    node: DockerNode,
  ): Promise<{ name: string; id: string; state: string; status: string }[] | null> {
    try {
      const ssh = DockerSSHClient.getClient(node.hostname);
      await ssh.connect();

      const output = await ssh.exec(
        "docker ps -a --format '{{.Names}}|{{.ID}}|{{.State}}|{{.Status}}'",
        15_000,
      );

      return output
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [name = "", id = "", state = "", status = ""] = line.split("|");
          return { name, id, state: state.toLowerCase(), status };
        });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(
        `[docker-node-manager] Failed to list containers on ${node.node_id}: ${msg}`,
      );
      return null;
    }
  }
}

export const dockerNodeManager = DockerNodeManager.getInstance();

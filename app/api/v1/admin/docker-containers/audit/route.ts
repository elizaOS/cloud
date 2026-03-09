/**
 * Admin Docker Container Audit API
 *
 * POST /api/v1/admin/docker-containers/audit
 *   Run ghost container detection: compare DB records vs actual running
 *   containers on all Docker nodes via SSH.
 *
 * Returns containers that exist in the DB but not on the node (orphan DB records)
 * and containers running on nodes but not tracked in the DB (ghost containers).
 *
 * Requires admin role.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { dockerNodesRepository } from "@/db/repositories/docker-nodes";
import { dbRead } from "@/db/helpers";
import { miladySandboxes } from "@/db/schemas/milady-sandboxes";
import { eq, and, ne } from "drizzle-orm";
import { DockerSSHClient } from "@/lib/services/docker-ssh";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// POST — Run ghost container detection audit
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Admin access required";
    return NextResponse.json(
      { success: false, error: message },
      { status: 403 },
    );
  }

  try {
    const nodes = await dockerNodesRepository.findEnabled();

    if (nodes.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          nodesChecked: 0,
          ghostContainers: [],
          orphanRecords: [],
          message: "No enabled Docker nodes to audit",
        },
      });
    }

    const auditResults: {
      nodeId: string;
      hostname: string;
      ghostContainers: string[];
      orphanRecords: Array<{ id: string; containerName: string | null }>;
      error?: string;
    }[] = [];

    let totalGhosts = 0;
    let totalOrphans = 0;

    for (const node of nodes) {
      const result = {
        nodeId: node.node_id,
        hostname: node.hostname,
        ghostContainers: [] as string[],
        orphanRecords: [] as Array<{ id: string; containerName: string | null }>,
        error: undefined as string | undefined,
      };

      try {
        // Get containers tracked in DB for this node
        const dbContainers = await dbRead
          .select({
            id: miladySandboxes.id,
            containerName: miladySandboxes.container_name,
            status: miladySandboxes.status,
          })
          .from(miladySandboxes)
          .where(
            and(
              eq(miladySandboxes.node_id, node.node_id),
              ne(miladySandboxes.status, "stopped"),
            ),
          );

        // Get actual running containers on the node via SSH
        const ssh = new DockerSSHClient({
          hostname: node.hostname,
          port: node.ssh_port,
          username: node.ssh_user,
        });

        let actualContainers: string[] = [];
        try {
          const psOutput = await ssh.exec(
            "docker ps --format '{{.Names}}' 2>/dev/null || true",
          );
          actualContainers = psOutput
            .trim()
            .split("\n")
            .filter(Boolean);
        } finally {
          try {
            await ssh.disconnect();
          } catch {
            // ignore cleanup errors
          }
        }

        const actualSet = new Set(actualContainers);
        const dbNameSet = new Set(
          dbContainers
            .map((c) => c.containerName)
            .filter((n): n is string => n !== null),
        );

        // Ghost containers: running on node but not in DB
        for (const name of actualContainers) {
          if (!dbNameSet.has(name)) {
            result.ghostContainers.push(name);
          }
        }

        // Orphan records: in DB but not running on node
        for (const record of dbContainers) {
          if (record.containerName && !actualSet.has(record.containerName)) {
            result.orphanRecords.push({
              id: record.id,
              containerName: record.containerName,
            });
          }
        }

        totalGhosts += result.ghostContainers.length;
        totalOrphans += result.orphanRecords.length;
      } catch (error) {
        result.error =
          error instanceof Error ? error.message : "Failed to audit node";
        logger.warn("[Admin Docker Audit] Node audit failed", {
          nodeId: node.node_id,
          error: result.error,
        });
      }

      auditResults.push(result);
    }

    logger.info("[Admin Docker Audit] Audit completed", {
      nodesChecked: nodes.length,
      totalGhosts,
      totalOrphans,
    });

    return NextResponse.json({
      success: true,
      data: {
        nodesChecked: nodes.length,
        totalGhostContainers: totalGhosts,
        totalOrphanRecords: totalOrphans,
        nodes: auditResults,
        auditedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error("[Admin Docker Audit] Audit failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: "Container audit failed" },
      { status: 500 },
    );
  }
}

/**
 * Admin Docker Containers API
 *
 * GET /api/v1/admin/docker-containers — List all Docker containers across nodes
 * Requires super_admin role.
 */

import { and, desc, eq, isNotNull, type SQL, sql } from "drizzle-orm";
import { Hono } from "hono";
import { requireAdmin } from "@/api-lib/auth";
import type { AppEnv } from "@/api-lib/context";
import { ForbiddenError, failureResponse, ValidationError } from "@/api-lib/errors";
import { dbRead } from "@/db/helpers";
import { type MiladySandboxStatus, miladySandboxes } from "@/db/schemas/milady-sandboxes";
import { getStewardAgent } from "@/lib/services/steward-client";
import { logger } from "@/lib/utils/logger";

const app = new Hono<AppEnv>();

const STEWARD_ENRICHMENT_CONCURRENCY = 5;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

app.get("/", async (c) => {
  try {
    const { role } = await requireAdmin(c);
    if (role !== "super_admin") throw ForbiddenError("Super admin access required");

    const statusFilter = c.req.query("status");
    const nodeFilter = c.req.query("nodeId");
    const limit = Math.min(parseInt(c.req.query("limit") || "100", 10), 500);

    const conditions: SQL[] = [isNotNull(miladySandboxes.node_id)];

    const VALID_STATUSES = new Set<string>([
      "pending",
      "provisioning",
      "running",
      "stopped",
      "disconnected",
      "error",
    ]);
    if (statusFilter) {
      if (!VALID_STATUSES.has(statusFilter)) {
        throw ValidationError(`Invalid status filter: ${statusFilter}`);
      }
      conditions.push(eq(miladySandboxes.status, statusFilter as MiladySandboxStatus));
    }

    if (nodeFilter) {
      conditions.push(eq(miladySandboxes.node_id, nodeFilter));
    }

    const [countResult] = await dbRead
      .select({ count: sql<number>`count(*)::int` })
      .from(miladySandboxes)
      .where(and(...conditions));

    const totalCount = countResult?.count ?? 0;

    const containers = await dbRead
      .select({
        id: miladySandboxes.id,
        sandboxId: miladySandboxes.sandbox_id,
        organizationId: miladySandboxes.organization_id,
        userId: miladySandboxes.user_id,
        agentName: miladySandboxes.agent_name,
        status: miladySandboxes.status,
        nodeId: miladySandboxes.node_id,
        containerName: miladySandboxes.container_name,
        bridgePort: miladySandboxes.bridge_port,
        webUiPort: miladySandboxes.web_ui_port,
        headscaleIp: miladySandboxes.headscale_ip,
        dockerImage: miladySandboxes.docker_image,
        bridgeUrl: miladySandboxes.bridge_url,
        healthUrl: miladySandboxes.health_url,
        lastHeartbeatAt: miladySandboxes.last_heartbeat_at,
        errorMessage: miladySandboxes.error_message,
        errorCount: miladySandboxes.error_count,
        createdAt: miladySandboxes.created_at,
        updatedAt: miladySandboxes.updated_at,
      })
      .from(miladySandboxes)
      .where(and(...conditions))
      .orderBy(desc(miladySandboxes.created_at))
      .limit(limit);

    const enrichedContainers = await mapWithConcurrency(
      containers,
      STEWARD_ENRICHMENT_CONCURRENCY,
      async (item) => {
        let walletAddress: string | null = null;
        let walletProvider: "steward" | null = null;

        if (item.nodeId) {
          try {
            const stewardAgent = await getStewardAgent(item.id, {
              organizationId: item.organizationId,
            });
            if (stewardAgent?.walletAddress) {
              walletAddress = stewardAgent.walletAddress;
              walletProvider = "steward";
            } else {
              walletProvider = "steward";
            }
          } catch {
            // Steward unreachable — leave as null
          }
        }

        return { ...item, walletAddress, walletProvider };
      },
    );

    return c.json({
      success: true,
      data: {
        containers: enrichedContainers,
        total: totalCount,
        returned: containers.length,
        filters: { status: statusFilter, nodeId: nodeFilter, limit },
      },
    });
  } catch (error) {
    logger.error("[Admin Docker Containers] Failed to list containers", {
      error: error instanceof Error ? error.message : String(error),
    });
    return failureResponse(c, error);
  }
});

export default app;

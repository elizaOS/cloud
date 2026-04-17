/**
 * Admin Docker Containers API
 *
 * GET /api/v1/admin/docker-containers — List all Docker containers across nodes
 *
 * Queries milady_sandboxes where node_id is set (Docker-backed containers).
 * Supports optional query params for filtering.
 *
 * Requires admin role.
 */

import { and, desc, eq, isNotNull, type SQL, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { dbRead } from "@/db/helpers";
import {
  type MiladySandboxStatus,
  miladySandboxes,
} from "@/db/schemas/milady-sandboxes";
import { requireAdmin } from "@/lib/auth";
import { getStewardAgent } from "@/lib/services/steward-client";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

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

// ---------------------------------------------------------------------------
// GET — List all Docker containers across all nodes
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const { role } = await requireAdmin(request);
  if (role !== "super_admin") {
    return NextResponse.json(
      { success: false, error: "Super admin access required" },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get("status");
  const nodeFilter = searchParams.get("nodeId");
  const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 500);

  try {
    // Build conditions array for combined WHERE clause
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
        return NextResponse.json(
          { success: false, error: `Invalid status filter: ${statusFilter}` },
          { status: 400 },
        );
      }
      conditions.push(
        eq(miladySandboxes.status, statusFilter as MiladySandboxStatus),
      );
    }

    if (nodeFilter) {
      conditions.push(eq(miladySandboxes.node_id, nodeFilter));
    }

    // Get the actual total count matching filters (not bounded by limit)
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

    // Enrich containers with wallet info from Steward (best-effort, parallel)
    const enrichedContainers = await mapWithConcurrency(
      containers,
      STEWARD_ENRICHMENT_CONCURRENCY,
      async (c) => {
        let walletAddress: string | null = null;
        let walletProvider: "steward" | "privy" | null = null;

        // All Docker-node containers use Steward wallets
        if (c.nodeId) {
          try {
            const stewardAgent = await getStewardAgent(c.id);
            if (stewardAgent?.walletAddress) {
              walletAddress = stewardAgent.walletAddress;
              walletProvider = "steward";
            } else {
              walletProvider = "steward"; // registered but wallet pending
            }
          } catch {
            // Steward unreachable — leave as null
          }
        }

        return {
          ...c,
          walletAddress,
          walletProvider,
        };
      },
    );

    return NextResponse.json({
      success: true,
      data: {
        containers: enrichedContainers,
        total: totalCount, // actual total matching filters
        returned: containers.length, // number returned in this page
        filters: {
          status: statusFilter,
          nodeId: nodeFilter,
          limit,
        },
      },
    });
  } catch (error) {
    logger.error("[Admin Docker Containers] Failed to list containers", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: "Failed to list Docker containers" },
      { status: 500 },
    );
  }
}

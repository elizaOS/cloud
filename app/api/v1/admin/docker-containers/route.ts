/**
 * Admin Docker Containers API
 *
 * GET /api/v1/admin/docker-containers — List all Docker containers across nodes
 *
 * Queries milaidy_sandboxes where node_id is set (Docker-backed containers).
 * Supports optional query params for filtering.
 *
 * Requires admin role.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { dbRead } from "@/db/helpers";
import { milaidySandboxes } from "@/db/schemas/milaidy-sandboxes";
import { isNotNull, eq, desc, and, type SQL } from "drizzle-orm";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET — List all Docker containers across all nodes
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
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

  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get("status");
  const nodeFilter = searchParams.get("nodeId");
  const limit = Math.min(
    parseInt(searchParams.get("limit") || "100", 10),
    500,
  );

  try {
    // Build conditions array for combined WHERE clause
    const conditions: SQL[] = [isNotNull(milaidySandboxes.node_id)];

    if (statusFilter) {
      conditions.push(eq(milaidySandboxes.status, statusFilter as any));
    }

    if (nodeFilter) {
      conditions.push(eq(milaidySandboxes.node_id, nodeFilter));
    }

    const containers = await dbRead
      .select({
        id: milaidySandboxes.id,
        sandboxId: milaidySandboxes.sandbox_id,
        organizationId: milaidySandboxes.organization_id,
        userId: milaidySandboxes.user_id,
        agentName: milaidySandboxes.agent_name,
        status: milaidySandboxes.status,
        nodeId: milaidySandboxes.node_id,
        containerName: milaidySandboxes.container_name,
        bridgePort: milaidySandboxes.bridge_port,
        webUiPort: milaidySandboxes.web_ui_port,
        headscaleIp: milaidySandboxes.headscale_ip,
        dockerImage: milaidySandboxes.docker_image,
        bridgeUrl: milaidySandboxes.bridge_url,
        healthUrl: milaidySandboxes.health_url,
        lastHeartbeatAt: milaidySandboxes.last_heartbeat_at,
        errorMessage: milaidySandboxes.error_message,
        errorCount: milaidySandboxes.error_count,
        createdAt: milaidySandboxes.created_at,
        updatedAt: milaidySandboxes.updated_at,
      })
      .from(milaidySandboxes)
      .where(and(...conditions))
      .orderBy(desc(milaidySandboxes.created_at))
      .limit(limit);

    return NextResponse.json({
      success: true,
      data: {
        containers,
        total: containers.length,
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

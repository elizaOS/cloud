/**
 * POST /api/v1/admin/docker-nodes/sync
 * Reconcile allocated_count in docker_nodes with actual active sandboxes.
 * Requires admin role.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { dockerNodeManager } from "@/lib/services/docker-node-manager";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { role } = await requireAdmin(request);
  if (role !== "super_admin") {
    return NextResponse.json(
      { success: false, error: "Super admin access required" },
      { status: 403 },
    );
  }

  try {
    const changes = await dockerNodeManager.syncAllocatedCounts();
    const changesObj = Object.fromEntries(
      Array.from(changes.entries()).map(([nodeId, diff]) => [nodeId, diff])
    );

    logger.info("[Admin Docker Sync] Allocated count sync completed", {
      nodesChanged: changes.size,
    });

    return NextResponse.json({
      success: true,
      data: {
        nodesChanged: changes.size,
        changes: changesObj,
        syncedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error("[Admin Docker Sync] Sync failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: "Allocated count sync failed" },
      { status: 500 },
    );
  }
}

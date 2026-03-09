/**
 * Admin Docker Node Detail API
 *
 * GET    /api/v1/admin/docker-nodes/:nodeId — Get single node details
 * PATCH  /api/v1/admin/docker-nodes/:nodeId — Update node settings
 * DELETE /api/v1/admin/docker-nodes/:nodeId — Remove node (only if no containers)
 *
 * Requires admin role.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { dockerNodesRepository } from "@/db/repositories/docker-nodes";
import { dbRead } from "@/db/helpers";
import { milaidySandboxes } from "@/db/schemas/milaidy-sandboxes";
import { eq, and, ne } from "drizzle-orm";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ nodeId: string }> };

// ---------------------------------------------------------------------------
// GET — Get single node details
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest, { params }: RouteParams) {
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

  const { nodeId } = await params;

  try {
    const node = await dockerNodesRepository.findByNodeId(nodeId);
    if (!node) {
      return NextResponse.json(
        { success: false, error: `Node '${nodeId}' not found` },
        { status: 404 },
      );
    }

    // Fetch containers on this node
    const containers = await dbRead
      .select({
        id: milaidySandboxes.id,
        sandboxId: milaidySandboxes.sandbox_id,
        containerName: milaidySandboxes.container_name,
        agentName: milaidySandboxes.agent_name,
        status: milaidySandboxes.status,
        bridgePort: milaidySandboxes.bridge_port,
        webUiPort: milaidySandboxes.web_ui_port,
        headscaleIp: milaidySandboxes.headscale_ip,
        createdAt: milaidySandboxes.created_at,
      })
      .from(milaidySandboxes)
      .where(eq(milaidySandboxes.node_id, nodeId));

    return NextResponse.json({
      success: true,
      data: {
        id: node.id,
        nodeId: node.node_id,
        hostname: node.hostname,
        sshPort: node.ssh_port,
        sshUser: node.ssh_user,
        capacity: node.capacity,
        allocatedCount: node.allocated_count,
        availableSlots: node.capacity - node.allocated_count,
        enabled: node.enabled,
        status: node.status,
        lastHealthCheck: node.last_health_check,
        metadata: node.metadata,
        createdAt: node.created_at,
        updatedAt: node.updated_at,
        containers,
      },
    });
  } catch (error) {
    logger.error("[Admin Docker Nodes] Failed to get node", {
      nodeId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: "Failed to get Docker node" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH — Update node settings
// ---------------------------------------------------------------------------

const updateNodeSchema = z
  .object({
    enabled: z.boolean().optional(),
    capacity: z.number().int().min(1).optional(),
    sshPort: z.number().int().min(1).max(65535).optional(),
    sshUser: z.string().min(1).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "At least one field must be provided for update",
  });

export async function PATCH(request: NextRequest, { params }: RouteParams) {
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

  const { nodeId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = updateNodeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  try {
    const existing = await dockerNodesRepository.findByNodeId(nodeId);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: `Node '${nodeId}' not found` },
        { status: 404 },
      );
    }

    const { enabled, capacity, sshPort, sshUser, metadata } = parsed.data;

    const updateData: Record<string, unknown> = {};
    if (enabled !== undefined) updateData.enabled = enabled;
    if (capacity !== undefined) updateData.capacity = capacity;
    if (sshPort !== undefined) updateData.ssh_port = sshPort;
    if (sshUser !== undefined) updateData.ssh_user = sshUser;
    if (metadata !== undefined) updateData.metadata = metadata;

    const updated = await dockerNodesRepository.update(existing.id, updateData);

    logger.info("[Admin Docker Nodes] Node updated", {
      nodeId,
      fields: Object.keys(parsed.data),
    });

    return NextResponse.json({
      success: true,
      data: updated
        ? {
            id: updated.id,
            nodeId: updated.node_id,
            hostname: updated.hostname,
            sshPort: updated.ssh_port,
            sshUser: updated.ssh_user,
            capacity: updated.capacity,
            allocatedCount: updated.allocated_count,
            enabled: updated.enabled,
            status: updated.status,
            lastHealthCheck: updated.last_health_check,
            metadata: updated.metadata,
            updatedAt: updated.updated_at,
          }
        : null,
    });
  } catch (error) {
    logger.error("[Admin Docker Nodes] Failed to update node", {
      nodeId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: "Failed to update Docker node" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE — Remove node (only if no containers are running on it)
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest, { params }: RouteParams) {
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

  const { nodeId } = await params;

  try {
    const existing = await dockerNodesRepository.findByNodeId(nodeId);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: `Node '${nodeId}' not found` },
        { status: 404 },
      );
    }

    // Check for active containers on this node
    const activeContainers = await dbRead
      .select({ id: milaidySandboxes.id })
      .from(milaidySandboxes)
      .where(
        and(
          eq(milaidySandboxes.node_id, nodeId),
          ne(milaidySandboxes.status, "stopped"),
        ),
      );

    if (activeContainers.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot remove node '${nodeId}': ${activeContainers.length} active container(s) still running. Stop or migrate them first.`,
        },
        { status: 409 },
      );
    }

    const deleted = await dockerNodesRepository.delete(existing.id);
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: "Failed to delete node record" },
        { status: 500 },
      );
    }

    logger.info("[Admin Docker Nodes] Node removed", { nodeId });

    return NextResponse.json({
      success: true,
      data: { nodeId, deleted: true },
    });
  } catch (error) {
    logger.error("[Admin Docker Nodes] Failed to delete node", {
      nodeId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: "Failed to delete Docker node" },
      { status: 500 },
    );
  }
}

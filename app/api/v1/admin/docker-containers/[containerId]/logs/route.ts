/**
 * Admin Docker Container Logs API
 *
 * GET /api/v1/admin/docker-containers/:containerId/logs
 *   Fetch container logs from the remote node via SSH.
 *
 * Query params:
 *   - lines: Number of tail lines (default 100, max 5000)
 *   - since: Optional timestamp for --since flag (e.g. "2024-01-01T00:00:00Z" or "1h")
 *
 * Requires admin role.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { dbRead } from "@/db/helpers";
import { milaidySandboxes } from "@/db/schemas/milaidy-sandboxes";
import { eq } from "drizzle-orm";
import { dockerNodesRepository } from "@/db/repositories/docker-nodes";
import { DockerSSHClient } from "@/lib/services/docker-ssh";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ containerId: string }> };

// ---------------------------------------------------------------------------
// GET — Fetch container logs from remote node
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

  const { containerId } = await params;

  const { searchParams } = new URL(request.url);
  const lines = Math.min(
    Math.max(parseInt(searchParams.get("lines") || "100", 10), 1),
    5000,
  );
  const since = searchParams.get("since") || undefined;

  try {
    // Look up the container record
    const [container] = await dbRead
      .select({
        id: milaidySandboxes.id,
        sandboxId: milaidySandboxes.sandbox_id,
        containerName: milaidySandboxes.container_name,
        nodeId: milaidySandboxes.node_id,
        agentName: milaidySandboxes.agent_name,
        status: milaidySandboxes.status,
      })
      .from(milaidySandboxes)
      .where(eq(milaidySandboxes.id, containerId))
      .limit(1);

    if (!container) {
      return NextResponse.json(
        { success: false, error: `Container '${containerId}' not found` },
        { status: 404 },
      );
    }

    if (!container.nodeId) {
      return NextResponse.json(
        {
          success: false,
          error: "Container is not backed by a Docker node (no node_id)",
        },
        { status: 400 },
      );
    }

    if (!container.containerName) {
      return NextResponse.json(
        {
          success: false,
          error: "Container record has no container_name set",
        },
        { status: 400 },
      );
    }

    // Look up the node
    const node = await dockerNodesRepository.findByNodeId(container.nodeId);
    if (!node) {
      return NextResponse.json(
        {
          success: false,
          error: `Node '${container.nodeId}' not found in database`,
        },
        { status: 404 },
      );
    }

    // Build docker logs command
    let cmd = `docker logs --tail ${lines}`;
    if (since) {
      // Sanitize the since value (allow alphanumeric, colons, dashes, dots, plus, T, Z)
      const sanitized = since.replace(/[^a-zA-Z0-9:.\-+TZ]/g, "");
      cmd += ` --since "${sanitized}"`;
    }
    cmd += ` ${container.containerName} 2>&1`;

    // SSH to node and fetch logs
    const ssh = new DockerSSHClient(node.hostname, node.ssh_port, node.ssh_user);
    let logOutput: string;

    try {
      logOutput = await ssh.exec(cmd, 30_000); // 30s timeout for log fetch
    } finally {
      try {
        await ssh.disconnect();
      } catch {
        // ignore cleanup errors
      }
    }

    logger.info("[Admin Docker Containers] Logs fetched", {
      containerId,
      containerName: container.containerName,
      nodeId: container.nodeId,
      lines,
      since,
      outputLength: logOutput.length,
    });

    return NextResponse.json({
      success: true,
      data: {
        containerId,
        containerName: container.containerName,
        nodeId: container.nodeId,
        agentName: container.agentName,
        lines,
        since: since || null,
        logs: logOutput,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error("[Admin Docker Containers] Failed to fetch logs", {
      containerId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: "Failed to fetch container logs" },
      { status: 500 },
    );
  }
}

/**
 * Admin Docker Container Logs API
 *
 * GET /api/v1/admin/docker-containers/[id]/logs
 *   Fetch raw docker logs for a specific container via SSH.
 *
 * The `id` param is resolved as follows:
 *   1. UUID primary key lookup (milady_sandboxes.id via findById)
 *   2. Fallback: sandbox_id text lookup (milady_sandboxes.sandbox_id)
 *
 * Query params:
 *   - lines: number of tail lines (default 200, max 5000)
 *   - since: optional timestamp for --since flag (e.g. "2024-01-01T00:00:00Z" or "1h")
 *
 * Requires super_admin role.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { miladySandboxesRepository } from "@/db/repositories/milady-sandboxes";
import { dockerNodesRepository } from "@/db/repositories/docker-nodes";
import { DockerSSHClient } from "@/lib/services/docker-ssh";
import { shellQuote } from "@/lib/services/docker-sandbox-utils";
import { logger } from "@/lib/utils/logger";
import { isValidDockerLogsSince } from "./since";

export const dynamic = "force-dynamic";

const DEFAULT_LINES = 200;
const MAX_LINES = 5000;
const LOG_FETCH_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// GET — Fetch docker logs for a container
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { role } = await requireAdmin(request);
  if (role !== "super_admin") {
    return NextResponse.json(
      { success: false, error: "Super admin access required" },
      { status: 403 },
    );
  }

  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      { success: false, error: "Missing container/sandbox ID" },
      { status: 400 },
    );
  }

  // Parse query params
  const { searchParams } = new URL(request.url);
  const linesParam = searchParams.get("lines");
  let lines = DEFAULT_LINES;
  if (linesParam) {
    const parsed = parseInt(linesParam, 10);
    if (!isNaN(parsed) && parsed > 0) {
      lines = Math.min(parsed, MAX_LINES);
    }
  }
  const since = searchParams.get("since") || undefined;

  if (since && !isValidDockerLogsSince(since)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid since parameter. Use an ISO-8601 timestamp or relative duration like 1h.",
      },
      { status: 400 },
    );
  }

  try {
    // Resolve the container record: try UUID PK first (dashboard sends
    // the DB `id`), then fall back to sandbox_id for CLI / direct callers.
    const sandbox =
      (await miladySandboxesRepository.findById(id)) ??
      (await miladySandboxesRepository.findBySandboxId(id));

    if (!sandbox) {
      return NextResponse.json(
        { success: false, error: `Container "${id}" not found` },
        { status: 404 },
      );
    }

    if (!sandbox.node_id || !sandbox.container_name) {
      return NextResponse.json(
        {
          success: false,
          error: "Sandbox is not a Docker container (missing node_id or container_name)",
        },
        { status: 400 },
      );
    }

    // Get node SSH config
    const node = await dockerNodesRepository.findByNodeId(sandbox.node_id);
    if (!node) {
      return NextResponse.json(
        { success: false, error: `Docker node "${sandbox.node_id}" not found` },
        { status: 404 },
      );
    }

    // Build docker logs command with proper shell quoting
    let cmd = `docker logs --tail ${lines}`;
    if (since) {
      cmd += ` --since ${shellQuote(since)}`;
    }
    cmd += ` ${shellQuote(sandbox.container_name)} 2>&1`;

    // SSH to node — use node's configured ssh_user (not env default)
    const ssh = new DockerSSHClient({
      hostname: node.hostname,
      port: node.ssh_port,
      username: node.ssh_user,
      hostKeyFingerprint: node.host_key_fingerprint ?? undefined,
    });

    let logs: string;
    try {
      logs = await ssh.exec(cmd, LOG_FETCH_TIMEOUT_MS);
    } finally {
      try {
        await ssh.disconnect();
      } catch {
        // ignore cleanup errors
      }
    }

    logger.info("[Admin Docker Logs] Logs fetched", {
      id,
      containerName: sandbox.container_name,
      nodeId: sandbox.node_id,
      lines,
      since,
      outputLength: logs.length,
    });

    return NextResponse.json({
      success: true,
      data: {
        containerId: sandbox.id,
        containerName: sandbox.container_name,
        nodeId: sandbox.node_id,
        agentName: sandbox.agent_name,
        lines,
        since: since || null,
        logs,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error("[Admin Docker Logs] Failed to fetch container logs", {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: "Failed to fetch container logs" },
      { status: 500 },
    );
  }
}

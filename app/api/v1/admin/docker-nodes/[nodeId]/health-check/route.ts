/**
 * Admin Docker Node Health Check API
 *
 * POST /api/v1/admin/docker-nodes/:nodeId/health-check
 *   Trigger a health check for a specific node: SSH to the node, verify the
 *   Docker daemon is responsive, and update status in the database.
 *
 * Requires admin role.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { dockerNodesRepository } from "@/db/repositories/docker-nodes";
import { DockerSSHClient } from "@/lib/services/docker-ssh";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ nodeId: string }> };

// ---------------------------------------------------------------------------
// POST — Trigger health check for specific node
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { role } = await requireAdmin(request);
  if (role !== "super_admin") {
    return NextResponse.json(
      { success: false, error: "Super admin access required" },
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

    logger.info("[Admin Docker Nodes] Starting health check", {
      nodeId,
      hostname: node.hostname,
    });

    const healthResult = await runNodeHealthCheck(node);

    // Update node status in DB
    await dockerNodesRepository.updateStatus(nodeId, healthResult.status);

    logger.info("[Admin Docker Nodes] Health check completed", {
      nodeId,
      status: healthResult.status,
    });

    return NextResponse.json({
      success: true,
      data: {
        nodeId,
        hostname: node.hostname,
        previousStatus: node.status,
        newStatus: healthResult.status,
        checks: healthResult.checks,
        checkedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error("[Admin Docker Nodes] Health check failed", {
      nodeId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: "Health check failed unexpectedly" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Health check implementation
// ---------------------------------------------------------------------------

interface HealthCheckResult {
  status: "healthy" | "degraded" | "offline";
  checks: {
    ssh: { ok: boolean; latencyMs?: number; error?: string };
    docker: { ok: boolean; version?: string; error?: string };
    diskUsage?: { ok: boolean; usedPercent?: number; error?: string };
    containers?: { running: number; total: number };
  };
}

async function runNodeHealthCheck(node: {
  hostname: string;
  ssh_port: number;
  ssh_user: string;
  host_key_fingerprint: string | null;
}): Promise<HealthCheckResult> {
  const checks: HealthCheckResult["checks"] = {
    ssh: { ok: false },
    docker: { ok: false },
  };

  let ssh: DockerSSHClient;

  try {
    // 1. SSH connectivity check
    const sshStart = Date.now();
    ssh = new DockerSSHClient({ hostname: node.hostname, port: node.ssh_port, username: node.ssh_user, hostKeyFingerprint: node.host_key_fingerprint ?? undefined });
    await ssh.exec("echo ok");
    checks.ssh = { ok: true, latencyMs: Date.now() - sshStart };
  } catch (error) {
    checks.ssh = {
      ok: false,
      error: error instanceof Error ? error.message : "SSH connection failed",
    };
    return { status: "offline", checks };
  }

  try {
    // 2. Docker daemon check
    const dockerVersion = await ssh.exec("docker version --format '{{.Server.Version}}'");
    checks.docker = {
      ok: true,
      version: dockerVersion.trim(),
    };
  } catch (error) {
    checks.docker = {
      ok: false,
      error: error instanceof Error ? error.message : "Docker check failed",
    };
    // SSH works but Docker doesn't → degraded
    await cleanupSSH(ssh);
    return { status: "degraded", checks };
  }

  try {
    // 3. Disk usage check
    const dfOutput = await ssh.exec("df -h / | tail -1 | awk '{print $5}'");
    const usedPercent = parseInt(dfOutput.replace("%", "").trim(), 10);
    checks.diskUsage = {
      ok: !isNaN(usedPercent) && usedPercent < 90,
      usedPercent: isNaN(usedPercent) ? undefined : usedPercent,
    };
  } catch (error) {
    checks.diskUsage = {
      ok: false,
      error: error instanceof Error ? error.message : "Disk check failed",
    };
  }

  try {
    // 4. Container count
    const psOutput = await ssh.exec("docker ps -a --format '{{.State}}' 2>/dev/null || true");
    const lines = psOutput.trim().split("\n").filter(Boolean);
    const running = lines.filter((l) => l === "running").length;
    checks.containers = { running, total: lines.length };
  } catch {
    // non-critical
  }

  await cleanupSSH(ssh);

  // Determine overall status
  const isDegraded =
    (checks.diskUsage && !checks.diskUsage.ok) || !checks.docker.ok;

  return {
    status: isDegraded ? "degraded" : "healthy",
    checks,
  };
}

async function cleanupSSH(ssh: DockerSSHClient | null) {
  if (ssh) {
    try {
      await ssh.disconnect();
    } catch {
      // ignore cleanup errors
    }
  }
}

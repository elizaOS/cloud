/**
 * Admin Infrastructure Container Actions API
 *
 * POST /api/v1/admin/infrastructure/containers/actions
 *
 * Performs actions on containers via SSH to the Docker node.
 * Works with any container on any registered node, not just DB-tracked ones.
 *
 * Body:
 *   - action: "logs" | "restart" | "stop" | "start" | "inspect" | "pull-recreate"
 *   - nodeId: string (docker_nodes.node_id)
 *   - containerName: string
 *   - lines?: number (for logs, default 200)
 *   - since?: string (for logs, e.g. "1h" or ISO timestamp)
 *
 * Requires super_admin role.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { dockerNodesRepository } from "@/db/repositories/docker-nodes";
import { DockerSSHClient } from "@/lib/services/docker-ssh";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const SSH_ACTION_TIMEOUT_MS = 30_000;
const SSH_LOGS_TIMEOUT_MS = 30_000;
const SSH_INSPECT_TIMEOUT_MS = 15_000;
const SSH_PULL_TIMEOUT_MS = 120_000;

type ContainerAction = "logs" | "restart" | "stop" | "start" | "inspect" | "pull-recreate";

const VALID_ACTIONS = new Set<ContainerAction>([
  "logs",
  "restart",
  "stop",
  "start",
  "inspect",
  "pull-recreate",
]);

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export async function POST(request: NextRequest) {
  const { role } = await requireAdmin(request);
  if (role !== "super_admin") {
    return NextResponse.json(
      { success: false, error: "Super admin access required" },
      { status: 403 },
    );
  }

  let body: {
    action: ContainerAction;
    nodeId: string;
    containerName: string;
    lines?: number;
    since?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { action, nodeId, containerName, lines = 200, since } = body;

  if (!action || !VALID_ACTIONS.has(action)) {
    return NextResponse.json(
      { success: false, error: `Invalid action: ${action}` },
      { status: 400 },
    );
  }

  if (!nodeId || !containerName) {
    return NextResponse.json(
      { success: false, error: "nodeId and containerName are required" },
      { status: 400 },
    );
  }

  // Validate containerName (prevent injection)
  if (!/^[a-zA-Z0-9_.-]+$/.test(containerName)) {
    return NextResponse.json(
      { success: false, error: "Invalid container name" },
      { status: 400 },
    );
  }

  const node = await dockerNodesRepository.findByNodeId(nodeId);
  if (!node) {
    return NextResponse.json(
      { success: false, error: `Docker node "${nodeId}" not found` },
      { status: 404 },
    );
  }

  const ssh = new DockerSSHClient({
    hostname: node.hostname,
    port: node.ssh_port,
    username: node.ssh_user,
    hostKeyFingerprint: node.host_key_fingerprint ?? undefined,
  });

  try {
    switch (action) {
      case "logs": {
        const tailLines = Math.min(Math.max(lines, 1), 5000);
        let cmd = `docker logs --tail ${tailLines}`;
        if (since) cmd += ` --since ${shellQuote(since)}`;
        cmd += ` ${shellQuote(containerName)} 2>&1`;

        const logs = await ssh.exec(cmd, SSH_LOGS_TIMEOUT_MS);
        return NextResponse.json({
          success: true,
          data: {
            action: "logs",
            nodeId,
            containerName,
            lines: tailLines,
            logs,
            fetchedAt: new Date().toISOString(),
          },
        });
      }

      case "restart": {
        const output = await ssh.exec(
          `docker restart ${shellQuote(containerName)} 2>&1`,
          SSH_ACTION_TIMEOUT_MS,
        );
        logger.info("[Admin Infrastructure] Container restarted", {
          nodeId,
          containerName,
          output: output.trim(),
        });
        return NextResponse.json({
          success: true,
          data: {
            action: "restart",
            nodeId,
            containerName,
            output: output.trim(),
            performedAt: new Date().toISOString(),
          },
        });
      }

      case "stop": {
        const output = await ssh.exec(
          `docker stop ${shellQuote(containerName)} 2>&1`,
          SSH_ACTION_TIMEOUT_MS,
        );
        logger.info("[Admin Infrastructure] Container stopped", {
          nodeId,
          containerName,
          output: output.trim(),
        });
        return NextResponse.json({
          success: true,
          data: {
            action: "stop",
            nodeId,
            containerName,
            output: output.trim(),
            performedAt: new Date().toISOString(),
          },
        });
      }

      case "start": {
        const output = await ssh.exec(
          `docker start ${shellQuote(containerName)} 2>&1`,
          SSH_ACTION_TIMEOUT_MS,
        );
        logger.info("[Admin Infrastructure] Container started", {
          nodeId,
          containerName,
          output: output.trim(),
        });
        return NextResponse.json({
          success: true,
          data: {
            action: "start",
            nodeId,
            containerName,
            output: output.trim(),
            performedAt: new Date().toISOString(),
          },
        });
      }

      case "inspect": {
        const output = await ssh.exec(
          `docker inspect ${shellQuote(containerName)} 2>&1`,
          SSH_INSPECT_TIMEOUT_MS,
        );

        // Also get resource usage
        let stats = "";
        try {
          stats = await ssh.exec(
            `docker stats --no-stream --format '{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}|{{.NetIO}}|{{.BlockIO}}|{{.PIDs}}' ${shellQuote(containerName)} 2>&1`,
            SSH_INSPECT_TIMEOUT_MS,
          );
        } catch {
          // stats may fail for stopped containers
        }

        let inspectData: Record<string, unknown> = {};
        try {
          const parsed = JSON.parse(output);
          inspectData = Array.isArray(parsed) ? parsed[0] : parsed;
        } catch {
          inspectData = { raw: output };
        }

        // Parse stats
        let resourceUsage: Record<string, string> = {};
        if (stats.trim()) {
          const parts = stats.trim().split("|");
          resourceUsage = {
            cpuPercent: parts[0] ?? "",
            memUsage: parts[1] ?? "",
            memPercent: parts[2] ?? "",
            netIO: parts[3] ?? "",
            blockIO: parts[4] ?? "",
            pids: parts[5] ?? "",
          };
        }

        return NextResponse.json({
          success: true,
          data: {
            action: "inspect",
            nodeId,
            containerName,
            inspect: inspectData,
            resourceUsage,
            fetchedAt: new Date().toISOString(),
          },
        });
      }

      case "pull-recreate": {
        // Get current container's image first
        const imageOutput = await ssh.exec(
          `docker inspect --format '{{.Config.Image}}' ${shellQuote(containerName)} 2>&1`,
          SSH_INSPECT_TIMEOUT_MS,
        );
        const image = imageOutput.trim();

        if (!image) {
          return NextResponse.json(
            { success: false, error: "Could not determine container image" },
            { status: 400 },
          );
        }

        // Pull latest
        const pullOutput = await ssh.exec(
          `docker pull ${shellQuote(image)} 2>&1`,
          SSH_PULL_TIMEOUT_MS,
        );

        logger.info("[Admin Infrastructure] Image pulled", {
          nodeId,
          containerName,
          image,
          pullOutput: pullOutput.slice(0, 500),
        });

        return NextResponse.json({
          success: true,
          data: {
            action: "pull-recreate",
            nodeId,
            containerName,
            image,
            pullOutput: pullOutput.trim(),
            note: "Image pulled. Container recreation requires docker-compose or manual recreation.",
            performedAt: new Date().toISOString(),
          },
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("[Admin Infrastructure] Container action failed", {
      action,
      nodeId,
      containerName,
      error: message,
    });
    return NextResponse.json(
      { success: false, error: `Action failed: ${message}` },
      { status: 500 },
    );
  } finally {
    try {
      await ssh.disconnect();
    } catch {
      // ignore cleanup errors
    }
  }
}

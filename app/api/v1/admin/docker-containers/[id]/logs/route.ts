/**
 * Admin Docker Container Logs API
 *
 * GET /api/v1/admin/docker-containers/[id]/logs
 *   Fetch raw docker logs for a specific container via SSH.
 *
 * Query params:
 *   - lines: number of tail lines (default 200, max 5000)
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

    const { id: sandboxId } = await params;

    if (!sandboxId) {
        return NextResponse.json(
            { success: false, error: "Missing sandbox ID" },
            { status: 400 },
        );
    }

    // Parse line count from query params
    const { searchParams } = new URL(request.url);
    const linesParam = searchParams.get("lines");
    let lines = DEFAULT_LINES;
    if (linesParam) {
        const parsed = parseInt(linesParam, 10);
        if (!isNaN(parsed) && parsed > 0) {
            lines = Math.min(parsed, MAX_LINES);
        }
    }

    try {
        // Look up sandbox record
        const sandbox = await miladySandboxesRepository.findBySandboxId(sandboxId);
        if (!sandbox) {
            return NextResponse.json(
                { success: false, error: `Sandbox "${sandboxId}" not found` },
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

        // SSH to node and fetch logs
        const ssh = DockerSSHClient.getClient(
            node.hostname,
            node.ssh_port ?? 22,
            node.host_key_fingerprint ?? undefined,
        );

        const logs = await ssh.exec(
            `docker logs --tail ${lines} ${shellQuote(sandbox.container_name)}`,
            LOG_FETCH_TIMEOUT_MS,
        );

        return NextResponse.json({
            success: true,
            data: {
                logs,
                containerName: sandbox.container_name,
                nodeId: sandbox.node_id,
                lines,
                fetchedAt: new Date().toISOString(),
            },
        });
    } catch (error) {
        logger.error("[Admin Docker Logs] Failed to fetch container logs", {
            sandboxId,
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { success: false, error: "Failed to fetch container logs" },
            { status: 500 },
        );
    }
}

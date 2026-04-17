/**
 * Admin Docker Nodes API
 *
 * GET  /api/v1/admin/docker-nodes — List all Docker nodes with status & capacity
 * POST /api/v1/admin/docker-nodes — Register a new Docker node
 *
 * Requires super_admin or admin role.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dockerNodesRepository } from "@/db/repositories/docker-nodes";
import { requireAdmin } from "@/lib/auth";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET — List all Docker nodes
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const { role } = await requireAdmin(request);
  if (role !== "super_admin") {
    return NextResponse.json(
      { success: false, error: "Super admin access required" },
      { status: 403 },
    );
  }

  try {
    const nodes = await dockerNodesRepository.findAll();

    return NextResponse.json({
      success: true,
      data: {
        nodes: nodes.map((n) => ({
          id: n.id,
          nodeId: n.node_id,
          hostname: n.hostname,
          sshPort: n.ssh_port,
          sshUser: n.ssh_user,
          capacity: n.capacity,
          allocatedCount: n.allocated_count,
          availableSlots: n.capacity - n.allocated_count,
          enabled: n.enabled,
          status: n.status,
          lastHealthCheck: n.last_health_check,
          metadata: n.metadata,
          createdAt: n.created_at,
          updatedAt: n.updated_at,
        })),
        total: nodes.length,
      },
    });
  } catch (error) {
    logger.error("[Admin Docker Nodes] Failed to list nodes", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: "Failed to list Docker nodes" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST — Register a new Docker node
// ---------------------------------------------------------------------------

/**
 * Reject hostnames that resolve to private/reserved IP ranges.
 * Defense-in-depth — even though this is admin-only, it prevents accidental
 * registration of cloud metadata endpoints or loopback addresses.
 */
function isReservedAddress(hostname: string): boolean {
  // Reject obvious IP-based patterns (not full DNS resolution, just input validation)
  const reserved = [
    /^127\./, // loopback
    /^10\./, // RFC-1918 Class A
    /^172\.(1[6-9]|2\d|3[01])\./, // RFC-1918 Class B
    /^192\.168\./, // RFC-1918 Class C
    /^169\.254\./, // link-local / cloud metadata
    /^0\./, // "this" network
    /^::1$/, // IPv6 loopback
    /^localhost$/i, // loopback hostname
    /^metadata\./i, // cloud metadata service
  ];
  return reserved.some((re) => re.test(hostname));
}

const createNodeSchema = z.object({
  nodeId: z.string().min(1, "nodeId is required"),
  hostname: z
    .string()
    .min(1, "hostname is required")
    .refine(
      (h) => !isReservedAddress(h),
      "Hostname cannot be a private/reserved IP address (loopback, RFC-1918, link-local, metadata)",
    ),
  sshPort: z.number().int().min(1).max(65535).optional().default(22),
  capacity: z.number().int().min(1).optional().default(8),
  sshUser: z.string().min(1).optional().default("root"),
  hostKeyFingerprint: z.string().min(1).optional(),
});

export async function POST(request: NextRequest) {
  const { role } = await requireAdmin(request);
  if (role !== "super_admin") {
    return NextResponse.json(
      { success: false, error: "Super admin access required" },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = createNodeSchema.safeParse(body);
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

  const { nodeId, hostname, sshPort, capacity, sshUser, hostKeyFingerprint } =
    parsed.data;

  try {
    // Check for duplicate nodeId
    const existing = await dockerNodesRepository.findByNodeId(nodeId);
    if (existing) {
      return NextResponse.json(
        { success: false, error: `Node with id '${nodeId}' already exists` },
        { status: 409 },
      );
    }

    const node = await dockerNodesRepository.create({
      node_id: nodeId,
      hostname,
      ssh_port: sshPort,
      capacity,
      ssh_user: sshUser,
      host_key_fingerprint: hostKeyFingerprint ?? null,
    });

    logger.info("[Admin Docker Nodes] Node registered", {
      nodeId,
      hostname,
      capacity,
    });

    const responseData: {
      id: string;
      nodeId: string;
      hostname: string;
      sshPort: number;
      sshUser: string;
      capacity: number;
      allocatedCount: number;
      enabled: boolean;
      status: string;
      createdAt: Date;
      warning?: string;
    } = {
      id: node.id,
      nodeId: node.node_id,
      hostname: node.hostname,
      sshPort: node.ssh_port,
      sshUser: node.ssh_user,
      capacity: node.capacity,
      allocatedCount: node.allocated_count,
      enabled: node.enabled,
      status: node.status,
      createdAt: node.created_at,
    };

    // Add warning if host key fingerprint is missing
    if (!hostKeyFingerprint) {
      responseData.warning =
        "No host key fingerprint set. SSH connections to this node are vulnerable to MITM attacks. Set host_key_fingerprint to pin the host key.";
    }

    return NextResponse.json(
      {
        success: true,
        data: responseData,
      },
      { status: 201 },
    );
  } catch (error) {
    logger.error("[Admin Docker Nodes] Failed to register node", {
      nodeId,
      hostname,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: "Failed to register Docker node" },
      { status: 500 },
    );
  }
}

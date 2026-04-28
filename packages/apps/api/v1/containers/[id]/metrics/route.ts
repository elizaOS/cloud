/**
 * Container metrics snapshot — Hetzner-Docker over SSH.
 *
 * Node-only (transitively imports `ssh2`); the Hono codegen for Workers
 * skips this leaf. The sidecar's Next.js entry serves the route.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import {
  getHetznerContainersClient,
  HetznerClientError,
} from "@/lib/services/containers/hetzner-client";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// TODO(auth): `requireAuthOrApiKeyWithOrg` is owned by Agent D.

/**
 * GET /api/v1/containers/[id]/metrics
 * Returns a `docker stats --no-stream` snapshot. Single point-in-time;
 * polling is the caller's responsibility.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { id } = await params;

    const metrics = await getHetznerContainersClient().getMetrics(id, user.organization_id!);

    return NextResponse.json({ success: true, data: metrics });
  } catch (error) {
    logger.error("Error fetching container metrics:", error);

    if (error instanceof HetznerClientError) {
      const status =
        error.code === "container_not_found" ? 404 : error.code === "ssh_unreachable" ? 503 : 500;
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch metrics",
      },
      { status: 500 },
    );
  }
}

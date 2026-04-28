/**
 * Container logs (tail) — Hetzner-Docker over SSH.
 *
 * Node-only (transitively imports `ssh2`); the Hono codegen for Workers
 * skips this leaf. The sidecar's Next.js entry serves the route.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import {
  HetznerClientError,
  getHetznerContainersClient,
} from "@/lib/services/containers/hetzner-client";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// TODO(auth): `requireAuthOrApiKeyWithOrg` is owned by Agent D.

/**
 * GET /api/v1/containers/[id]/logs?tail=200
 * Returns the last `tail` lines of stdout+stderr (combined) from the
 * container, fetched via `docker logs --tail N` over SSH.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { id } = await params;
    const url = new URL(request.url);
    const tailRaw = url.searchParams.get("tail");
    const tail = tailRaw ? Math.max(1, Math.min(10_000, parseInt(tailRaw, 10) || 200)) : 200;

    const logs = await getHetznerContainersClient().tailLogs(
      id,
      user.organization_id!,
      tail,
    );

    return NextResponse.json({
      success: true,
      data: { logs, tail },
    });
  } catch (error) {
    logger.error("Error fetching container logs:", error);

    if (error instanceof HetznerClientError) {
      const status =
        error.code === "container_not_found"
          ? 404
          : error.code === "ssh_unreachable"
            ? 503
            : 500;
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch logs",
      },
      { status: 500 },
    );
  }
}

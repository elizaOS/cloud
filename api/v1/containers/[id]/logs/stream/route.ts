/**
 * Container live log stream (SSE) — Hetzner-Docker over SSH.
 *
 * NOT YET IMPLEMENTED. Live streaming wraps `docker logs --follow` over
 * SSH and pipes the output to the client as Server-Sent Events. Holding
 * an open SSH channel for the lifetime of the SSE response is feasible
 * on the Node sidecar but not implemented here yet — see
 * `tailLogs()` on `hetzner-client.ts` for the snapshot variant.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 5;

// TODO(auth): `requireAuthOrApiKeyWithOrg` is owned by Agent D.

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Auth check still runs so we don't leak the existence of containers
    // to unauthenticated callers.
    await requireAuthOrApiKeyWithOrg(request);
    await params;
    return NextResponse.json(
      {
        success: false,
        error:
          "Live log streaming is not yet implemented for the Hetzner-Docker backend. Use GET /api/v1/containers/:id/logs?tail=N for a snapshot.",
        code: "stream_not_implemented",
      },
      { status: 501 },
    );
  } catch (error) {
    logger.error("Error in logs stream:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "stream failed" },
      { status: 500 },
    );
  }
}

/**
 * Code Agent Snapshot Restore API
 *
 * POST /api/v1/code-agent/sessions/:sessionId/snapshots/:snapshotId/restore
 * Restore session from a snapshot
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { codeAgentService } from "@/lib/services/code-agent";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit-redis";
import { logger } from "@/lib/utils/logger";

type RouteContext = { params: Promise<{ sessionId: string; snapshotId: string }> };

// =============================================================================
// HANDLER
// =============================================================================

async function handlePOST(request: NextRequest, context: RouteContext) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { sessionId, snapshotId } = await context.params;

  logger.info("[Code Agent API] Restoring snapshot", {
    sessionId,
    snapshotId,
  });

  // Verify session
  const session = await codeAgentService.getSession(sessionId, user.organization_id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const result = await codeAgentService.restoreSnapshot({
    sessionId,
    snapshotId,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json(result);
}

// =============================================================================
// EXPORT
// =============================================================================

export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);


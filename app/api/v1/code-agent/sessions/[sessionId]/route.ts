/**
 * Code Agent Session API
 *
 * GET /api/v1/code-agent/sessions/:sessionId - Get session details
 * DELETE /api/v1/code-agent/sessions/:sessionId - Terminate session
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { codeAgentService } from "@/lib/services/code-agent";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit-redis";
import { logger } from "@/lib/utils/logger";

type RouteContext = { params: Promise<{ sessionId: string }> };

// =============================================================================
// HANDLERS
// =============================================================================

async function handleGET(request: NextRequest, context: RouteContext) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { sessionId } = await context.params;

  const session = await codeAgentService.getSession(sessionId, user.organization_id);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json({ session });
}

async function handleDELETE(request: NextRequest, context: RouteContext) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { sessionId } = await context.params;

  logger.info("[Code Agent API] Terminating session", {
    sessionId,
    userId: user.id,
  });

  await codeAgentService.terminateSession(sessionId, user.organization_id);

  return NextResponse.json({ success: true, message: "Session terminated" });
}

// =============================================================================
// EXPORTS
// =============================================================================

export const GET = withRateLimit(handleGET, RateLimitPresets.RELAXED);
export const DELETE = withRateLimit(handleDELETE, RateLimitPresets.STANDARD);


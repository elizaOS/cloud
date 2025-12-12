/**
 * Code Agent Snapshots API
 *
 * GET /api/v1/code-agent/sessions/:sessionId/snapshots - List snapshots
 * POST /api/v1/code-agent/sessions/:sessionId/snapshots - Create snapshot
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { codeAgentService } from "@/lib/services/code-agent";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit-redis";
import { logger } from "@/lib/utils/logger";

type RouteContext = { params: Promise<{ sessionId: string }> };

// =============================================================================
// SCHEMAS
// =============================================================================

const createSnapshotSchema = z.object({
  name: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
});

// =============================================================================
// HANDLERS
// =============================================================================

async function handleGET(request: NextRequest, context: RouteContext) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { sessionId } = await context.params;

  // Verify session belongs to org
  const session = await codeAgentService.getSession(sessionId, user.organization_id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const snapshots = await codeAgentService.listSnapshots(sessionId);

  return NextResponse.json({ snapshots });
}

async function handlePOST(request: NextRequest, context: RouteContext) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { sessionId } = await context.params;

  const body = await request.json();
  const validated = createSnapshotSchema.parse(body);

  logger.info("[Code Agent API] Creating snapshot", {
    sessionId,
    name: validated.name,
  });

  // Verify session
  const session = await codeAgentService.getSession(sessionId, user.organization_id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const result = await codeAgentService.createSnapshot({
    sessionId,
    name: validated.name,
    description: validated.description,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json(result, { status: 201 });
}

// =============================================================================
// EXPORTS
// =============================================================================

export const GET = withRateLimit(handleGET, RateLimitPresets.RELAXED);
export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);


/**
 * Code Agent Files API
 *
 * GET /api/v1/code-agent/sessions/:sessionId/files?path=... - Read file or list directory
 * POST /api/v1/code-agent/sessions/:sessionId/files - Write file
 * DELETE /api/v1/code-agent/sessions/:sessionId/files?path=... - Delete file
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { codeAgentService } from "@/lib/services/code-agent";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit-redis";

type RouteContext = { params: Promise<{ sessionId: string }> };

// =============================================================================
// SCHEMAS
// =============================================================================

const writeFileSchema = z.object({
  path: z.string().min(1).max(500),
  content: z.string().max(10 * 1024 * 1024), // 10MB max
  createDirectories: z.boolean().default(true),
});

// =============================================================================
// HANDLERS
// =============================================================================

async function handleGET(request: NextRequest, context: RouteContext) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { sessionId } = await context.params;

  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");
  const list = searchParams.get("list") === "true";
  const recursive = searchParams.get("recursive") !== "false";
  const maxDepth = parseInt(searchParams.get("maxDepth") || "3", 10);

  if (!path) {
    return NextResponse.json({ error: "path query parameter is required" }, { status: 400 });
  }

  // Verify session
  const session = await codeAgentService.getSession(sessionId, user.organization_id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (list) {
    const result = await codeAgentService.listFiles({
      sessionId,
      path,
      recursive,
      maxDepth,
    });

    return NextResponse.json(result);
  } else {
    const result = await codeAgentService.readFile({ sessionId, path });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    return NextResponse.json(result);
  }
}

async function handlePOST(request: NextRequest, context: RouteContext) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { sessionId } = await context.params;

  const body = await request.json();
  const validated = writeFileSchema.parse(body);

  // Verify session
  const session = await codeAgentService.getSession(sessionId, user.organization_id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const result = await codeAgentService.writeFile({
    sessionId,
    path: validated.path,
    content: validated.content,
    createDirectories: validated.createDirectories,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json(result, { status: 201 });
}

async function handleDELETE(request: NextRequest, context: RouteContext) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { sessionId } = await context.params;

  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");
  const recursive = searchParams.get("recursive") === "true";

  if (!path) {
    return NextResponse.json({ error: "path query parameter is required" }, { status: 400 });
  }

  // Verify session
  const session = await codeAgentService.getSession(sessionId, user.organization_id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const result = await codeAgentService.deleteFile({
    sessionId,
    path,
    recursive,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json(result);
}

// =============================================================================
// EXPORTS
// =============================================================================

export const GET = withRateLimit(handleGET, RateLimitPresets.RELAXED);
export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);
export const DELETE = withRateLimit(handleDELETE, RateLimitPresets.STANDARD);


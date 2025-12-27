/**
 * Session Analytics API
 *
 * GET /api/v1/code-agent/sessions/:sessionId/analytics - Get session-specific analytics
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { codeAgentAnalyticsService } from "@/lib/services/code-agent/analytics";
import {
  withRateLimit,
  RateLimitPresets,
} from "@/lib/middleware/rate-limit-redis";

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

async function handleGET(request: NextRequest, { params }: RouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { sessionId } = await params;

  const analytics = await codeAgentAnalyticsService.getSessionAnalytics(
    sessionId,
    user.organization_id,
  );

  if (!analytics) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json({ analytics });
}

export const GET = withRateLimit(handleGET, RateLimitPresets.RELAXED);

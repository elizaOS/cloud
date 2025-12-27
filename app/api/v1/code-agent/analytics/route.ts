import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { codeAgentAnalyticsService } from "@/lib/services/code-agent/analytics";
import {
  withRateLimit,
  RateLimitPresets,
} from "@/lib/middleware/rate-limit-redis";

const querySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

async function handleGET(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const { searchParams } = new URL(request.url);
  const params = querySchema.parse({
    startDate: searchParams.get("startDate") || undefined,
    endDate: searchParams.get("endDate") || undefined,
  });

  const dateRange =
    params.startDate && params.endDate
      ? { start: new Date(params.startDate), end: new Date(params.endDate) }
      : undefined;

  const [stats, interpreterBreakdown, recentExecutions] = await Promise.all([
    codeAgentAnalyticsService.getStats(user.organization_id, dateRange),
    codeAgentAnalyticsService.getInterpreterAnalytics(
      user.organization_id,
      dateRange,
    ),
    codeAgentAnalyticsService.getRecentExecutions(user.organization_id, 10),
  ]);

  return NextResponse.json({
    stats,
    interpreterBreakdown,
    recentExecutions,
  });
}

export const GET = withRateLimit(handleGET, RateLimitPresets.RELAXED);

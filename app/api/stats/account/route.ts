import { NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { requireAuthWithOrg } from "@/lib/auth";
import { generationsService } from "@/lib/services/generations";
import { usageService } from "@/lib/services/usage";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { cache } from "@/lib/cache/client";

interface AccountStats {
  totalGenerations: number;
  totalGenerationsBreakdown: { images: number; videos: number };
  apiCalls24h: number;
  apiCalls24hSuccessful: number;
  imageGenerationsAllTime: number;
  videoRendersAllTime: number;
}

async function handleGET() {
  try {
    const user = await requireAuthWithOrg();
    const organizationId = user.organization_id;
    const cacheKey = `stats:account:${organizationId}`;

    const data = await cache.getWithSWR<AccountStats>(cacheKey, 60, async () => {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [generationStats, apiCallStats24h] = await Promise.all([
        generationsService.getStats(organizationId),
        usageService.getStatsByOrganization(organizationId, twentyFourHoursAgo),
      ]);

      const imageCount = generationStats.byType.find((t) => t.type === "image")?.count || 0;
      const videoCount = generationStats.byType.find((t) => t.type === "video")?.count || 0;

      return {
        totalGenerations: generationStats.totalGenerations,
        totalGenerationsBreakdown: { images: imageCount, videos: videoCount },
        apiCalls24h: apiCallStats24h.totalRequests,
        apiCalls24hSuccessful: Math.round(apiCallStats24h.totalRequests * apiCallStats24h.successRate),
        imageGenerationsAllTime: imageCount,
        videoRendersAllTime: videoCount,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    logger.error("Error fetching account stats:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Failed to fetch stats" }, { status: 500 });
  }
}

export const GET = withRateLimit(handleGET, RateLimitPresets.STANDARD);

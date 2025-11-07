import { NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { generationsService, usageService } from "@/lib/services";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";

async function handleGET() {
  try {
    const user = await requireAuthWithOrg();
    const organizationId = user.organization_id;

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [generationStats, apiCallStats24h] = await Promise.all([
      generationsService.getStats(organizationId),
      usageService.getStatsByOrganization(organizationId, twentyFourHoursAgo),
    ]);

    const imageCount =
      generationStats.byType.find((t) => t.type === "image")?.count || 0;
    const videoCount =
      generationStats.byType.find((t) => t.type === "video")?.count || 0;

    return NextResponse.json({
      success: true,
      data: {
        totalGenerations: generationStats.totalGenerations,
        totalGenerationsBreakdown: {
          images: imageCount,
          videos: videoCount,
        },
        apiCalls24h: apiCallStats24h.totalRequests,
        apiCalls24hSuccessful: Math.round(
          apiCallStats24h.totalRequests * apiCallStats24h.successRate,
        ),
        imageGenerationsAllTime: imageCount,
        videoRendersAllTime: videoCount,
      },
    });
  } catch (error) {
    console.error("Error fetching account stats:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch stats",
      },
      { status: 500 },
    );
  }
}

export const GET = withRateLimit(handleGET, RateLimitPresets.STANDARD);

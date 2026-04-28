/**
 * GET /api/stats/account
 * Account statistics: generations (all-time) + API calls (24h).
 */

import { Hono } from "hono";

import { generationsService } from "@/lib/services/generations";
import { usageService } from "@/lib/services/usage";
import { logger } from "@/lib/utils/logger";
import { requireUserOrApiKeyWithOrg } from "../../../src/lib/auth";
import type { AppEnv } from "../../../src/lib/context";
import { failureResponse } from "../../../src/lib/errors";
import { rateLimit, RateLimitPresets } from "../../../src/lib/rate-limit";

const app = new Hono<AppEnv>();

app.use("*", rateLimit(RateLimitPresets.STANDARD));

app.get("/", async (c) => {
  try {
    const user = await requireUserOrApiKeyWithOrg(c);
    const orgId = user.organization_id;
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [generationStats, apiCallStats24h] = await Promise.all([
      generationsService.getStats(orgId),
      usageService.getStatsByOrganization(orgId, twentyFourHoursAgo),
    ]);

    const imageCount = generationStats.byType.find((t) => t.type === "image")?.count || 0;
    const videoCount = generationStats.byType.find((t) => t.type === "video")?.count || 0;

    return c.json({
      success: true,
      data: {
        totalGenerations: generationStats.totalGenerations,
        totalGenerationsBreakdown: { images: imageCount, videos: videoCount },
        apiCalls24h: apiCallStats24h.totalRequests,
        apiCalls24hSuccessful: Math.round(
          apiCallStats24h.totalRequests * apiCallStats24h.successRate,
        ),
        imageGenerationsAllTime: imageCount,
        videoRendersAllTime: videoCount,
      },
    });
  } catch (error) {
    logger.error("Error fetching account stats:", error);
    return failureResponse(c, error);
  }
});

export default app;

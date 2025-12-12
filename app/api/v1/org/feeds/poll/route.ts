import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { feedConfigService } from "@/lib/services/social-feed";
import { feedPollingService } from "@/lib/services/social-feed/polling";
import { logger } from "@/lib/utils/logger";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  logger.info("[API] Manual feed poll triggered", {
    organizationId: user.organization_id,
    userId: user.id,
  });

  const { configs } = await feedConfigService.list({
    organizationId: user.organization_id,
    enabled: true,
    limit: 10,
  });

  let totalNewEngagements = 0;
  const results: Array<{
    configId: string;
    platform: string;
    newEngagements: number;
    errors: string[];
  }> = [];

  for (const config of configs) {
    const result = await feedPollingService.pollFeed(config);
    totalNewEngagements += result.newEngagements;
    results.push({
      configId: config.id,
      platform: config.source_platform,
      newEngagements: result.newEngagements,
      errors: result.errors,
    });
  }

  return NextResponse.json({
    success: true,
    data: {
      feedsPolled: configs.length,
      totalNewEngagements,
      results,
    },
  });
}

import { NextRequest, NextResponse } from "next/server";
import { withInternalAuth } from "@/lib/auth/internal-api";
import { usersRepository } from "@/db/repositories/users";
import { logger } from "@/lib/utils/logger";
import { elizaAppConfig } from "@/lib/services/eliza-app/config";
import { withCache } from "@/lib/cache/service-cache";

export const dynamic = "force-dynamic";

const SUPPORTED_PLATFORMS = ["discord", "telegram"] as const;
type Platform = (typeof SUPPORTED_PLATFORMS)[number];

export const GET = withInternalAuth(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const platform = searchParams.get("platform");
  const platformId = searchParams.get("platformId");

  if (!platform || !platformId) {
    return NextResponse.json(
      { error: "platform and platformId query params required" },
      { status: 400 },
    );
  }

  if (!SUPPORTED_PLATFORMS.includes(platform as Platform)) {
    return NextResponse.json(
      {
        error: `Unsupported platform: ${platform}. Supported: ${SUPPORTED_PLATFORMS.join(", ")}`,
      },
      { status: 400 },
    );
  }

  const cacheKey = `identity:${platform}:${platformId}`;
  const result = await withCache(cacheKey, 300, async () => {
    const user =
      platform === "discord"
        ? await usersRepository.findByDiscordIdWithOrganization(platformId)
        : await usersRepository.findByTelegramIdWithOrganization(platformId);

    if (!user) return null;

    return {
      userId: user.id,
      organizationId: user.organization_id,
      agentId: elizaAppConfig.defaultAgentId,
      platformData: {
        username:
          platform === "discord"
            ? user.discord_username
            : user.telegram_username,
        globalName:
          platform === "discord" ? user.discord_global_name : undefined,
      },
    };
  });

  if (!result) {
    logger.info("[Identity] User not found", { platform, platformId });
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json(result);
});

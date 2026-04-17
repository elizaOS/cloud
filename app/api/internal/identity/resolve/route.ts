import { NextRequest, NextResponse } from "next/server";
import {
  type UserWithOrganization,
  usersRepository,
} from "@/db/repositories/users";
import { withInternalAuth } from "@/lib/auth/internal-api";
import { CacheKeys, CacheTTL } from "@/lib/cache/keys";
import { withCache } from "@/lib/cache/service-cache";
import { elizaAppUserService } from "@/lib/services/eliza-app";
import { elizaAppConfig } from "@/lib/services/eliza-app/config";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const SUPPORTED_PLATFORMS = [
  "discord",
  "telegram",
  "twilio",
  "blooio",
  "whatsapp",
] as const;
type Platform = (typeof SUPPORTED_PLATFORMS)[number];

function lookupUser(platform: Platform, platformId: string) {
  switch (platform) {
    case "discord":
      return usersRepository.findByDiscordIdWithOrganization(platformId);
    case "telegram":
      return usersRepository.findByTelegramIdWithOrganization(platformId);
    case "twilio":
    case "blooio":
      return usersRepository.findByPhoneNumberWithOrganization(platformId);
    case "whatsapp":
      // WhatsApp ID is digits only (e.g., "14245074963"), derive E.164 for phone lookup
      return usersRepository.findByPhoneNumberWithOrganization(
        `+${platformId.replace(/\D/g, "")}`,
      );
  }
}

async function autoCreateUser(
  platform: Platform,
  platformId: string,
  platformName?: string,
) {
  switch (platform) {
    case "discord":
      return elizaAppUserService.findOrCreateByDiscordId(platformId, {
        username: platformName || platformId,
      });
    case "telegram":
      // Gateway services don't have full TelegramAuthData or phone numbers,
      // so we construct a minimal TelegramAuthData shape and use a synthetic
      // placeholder phone. The real phone can be linked later via Telegram OAuth.
      return elizaAppUserService.findOrCreateByTelegramWithPhone(
        {
          id: Number(platformId) || 0,
          first_name: platformName || platformId,
          auth_date: Math.floor(Date.now() / 1000),
          hash: "",
        },
        `+0${platformId}`, // synthetic phone placeholder — will be overwritten on real Telegram OAuth
      );
    case "twilio":
    case "blooio":
      return elizaAppUserService.findOrCreateByPhone(platformId);
    case "whatsapp":
      // WhatsApp ID is digits only — derive E.164 phone number
      return elizaAppUserService.findOrCreateByPhone(
        `+${platformId.replace(/\D/g, "")}`,
      );
  }
}

function extractPlatformData(platform: Platform, user: UserWithOrganization) {
  switch (platform) {
    case "discord":
      return {
        username: user.discord_username,
        globalName: user.discord_global_name,
      };
    case "telegram":
      return { username: user.telegram_username };
    case "twilio":
    case "blooio":
    case "whatsapp":
      return { phoneNumber: user.phone_number };
  }
}

export const GET = withInternalAuth(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const platform = searchParams.get("platform");
  const platformId = searchParams.get("platformId");
  const platformName = searchParams.get("platformName") || undefined;

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

  const typedPlatform = platform as Platform;
  const cacheKey = CacheKeys.identity.resolve(typedPlatform, platformId);

  const result = await withCache(
    cacheKey,
    CacheTTL.identity.resolve,
    async () => {
      let user = await lookupUser(typedPlatform, platformId);

      if (!user) {
        logger.info("[Identity] User not found, auto-creating", {
          platform,
          platformId,
        });
        try {
          const created = await autoCreateUser(
            typedPlatform,
            platformId,
            platformName,
          );
          // findOrCreate returns { user: User, organization }, build UserWithOrganization shape
          user = {
            ...created.user,
            organization: created.organization,
          } as UserWithOrganization;
        } catch (err) {
          logger.error("[Identity] Auto-create failed", {
            platform,
            platformId,
            error: err instanceof Error ? err.message : String(err),
          });
          return null;
        }
      }

      return {
        userId: user.id,
        organizationId: user.organization_id,
        agentId: elizaAppConfig.defaultAgentId,
        platformData: extractPlatformData(typedPlatform, user),
      };
    },
  );

  if (!result) {
    return NextResponse.json(
      { error: "Failed to resolve identity" },
      { status: 500 },
    );
  }

  return NextResponse.json(result);
});

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { socialRewardsService } from "@/lib/services";
import { addCorsHeaders, validateOrigin, createPreflightResponse } from "@/lib/middleware/cors-apps";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

const ClaimShareSchema = z.object({
  platform: z.enum(["x", "farcaster", "telegram", "discord"]),
  shareType: z.enum(["app_share", "character_share", "invite_share"]),
  shareUrl: z.string().url().optional(),
});

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return createPreflightResponse(origin, ["POST", "OPTIONS"]);
}

export async function POST(request: NextRequest) {
  const corsResult = await validateOrigin(request);

  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);

    const body = await request.json();
    const validationResult = ClaimShareSchema.safeParse(body);

    if (!validationResult.success) {
      const response = NextResponse.json(
        { success: false, error: "Invalid request data", details: validationResult.error.format() },
        { status: 400 }
      );
      return addCorsHeaders(response, corsResult.origin);
    }

    const { platform, shareType, shareUrl } = validationResult.data;

    // Get appId from header - credits go to app balance if present
    const appId = request.headers.get("X-App-Id") || undefined;

    const result = await socialRewardsService.claimShareReward(
      user.id,
      user.organization_id,
      platform,
      shareType,
      shareUrl,
      appId ? { appId } : undefined
    );

    if (!result.success) {
      const response = NextResponse.json(
        { success: false, error: result.message, alreadyAwarded: result.alreadyAwarded },
        { status: 400 }
      );
      return addCorsHeaders(response, corsResult.origin);
    }

    logger.info("[Miniapp Rewards] Share reward claimed", {
      userId: user.id,
      platform,
      shareType,
      amount: result.amount,
      appId,
    });

    const response = NextResponse.json({
      success: true,
      message: result.message,
      amount: result.amount,
      alreadyAwarded: result.alreadyAwarded,
    });

    return addCorsHeaders(response, corsResult.origin);
  } catch (error) {
    logger.error("[Miniapp Rewards] Error claiming share reward", { error });

    const status = error instanceof Error && error.message.includes("Unauthorized") ? 401 : 500;
    const response = NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to claim share reward" },
      { status }
    );

    return addCorsHeaders(response, corsResult.origin);
  }
}


import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { socialRewardsService } from "@/lib/services/referrals";
import {
  addCorsHeaders,
  validateOrigin,
  createPreflightResponse,
} from "@/lib/middleware/cors-apps";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

const ClaimShareSchema = z.object({
  platform: z.enum(["x", "farcaster", "telegram", "discord"]),
  shareType: z.enum(["app_share", "character_share", "invite_share"]),
  shareUrl: z.string().url().optional(),
});

/**
 * OPTIONS /api/v1/app/rewards/share
 * CORS preflight handler for app share rewards endpoint.
 *
 * @param request - The Next.js request object.
 * @returns Preflight response with CORS headers.
 */
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return createPreflightResponse(origin, ["POST", "OPTIONS"]);
}

/**
 * POST /api/v1/app/rewards/share
 * Claims a reward for sharing content on social platforms.
 * Supports X (Twitter), Farcaster, Telegram, and Discord.
 * If X-App-Id header is present, credits go to app balance (for monetized apps).
 *
 * Request Body:
 * - `platform`: Social platform - "x" | "farcaster" | "telegram" | "discord" (required).
 * - `shareType`: Type of share - "app_share" | "character_share" | "invite_share" (required).
 * - `shareUrl`: Optional URL of the shared content.
 *
 * @param request - Request body with platform, share type, and optional URL, plus optional X-App-Id header.
 * @returns Reward claim result with amount awarded and success status.
 */
export async function POST(request: NextRequest) {
  const corsResult = await validateOrigin(request);

  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);

    const body = await request.json();
    const validationResult = ClaimShareSchema.safeParse(body);

    if (!validationResult.success) {
      const response = NextResponse.json(
        {
          success: false,
          error: "Invalid request data",
          details: validationResult.error.format(),
        },
        { status: 400 },
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
      appId ? { appId } : undefined,
    );

    if (!result.success) {
      const response = NextResponse.json(
        {
          success: false,
          error: result.message,
          alreadyAwarded: result.alreadyAwarded,
        },
        { status: 400 },
      );
      return addCorsHeaders(response, corsResult.origin);
    }

    logger.info("[App Rewards] Share reward claimed", {
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
    logger.error("[App Rewards] Error claiming share reward", { error });

    const status =
      error instanceof Error && error.message.includes("Unauthorized")
        ? 401
        : 500;
    const response = NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to claim share reward",
      },
      { status },
    );

    return addCorsHeaders(response, corsResult.origin);
  }
}

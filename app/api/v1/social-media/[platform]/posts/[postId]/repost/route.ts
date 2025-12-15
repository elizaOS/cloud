/**
 * Repost API
 *
 * POST /api/v1/social-media/[platform]/posts/[postId]/repost
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { socialMediaService } from "@/lib/services/social-media";
import type { SocialPlatform } from "@/lib/types/social-media";

type RouteContext = { params: Promise<{ platform: string; postId: string }> };

export async function POST(request: NextRequest, ctx: RouteContext) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { platform, postId } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const credentialId = body.credentialId as string | undefined;

  if (!socialMediaService.isPlatformSupported(platform as SocialPlatform)) {
    return NextResponse.json(
      { error: `Unsupported platform: ${platform}` },
      { status: 400 },
    );
  }

  const result = await socialMediaService.repost(
    user.organization_id,
    platform as SocialPlatform,
    postId,
    credentialId,
  );

  if (!result.success) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json(result);
}

/**
 * Post-Specific Social Media API
 *
 * Operations on specific posts.
 *
 * GET    /api/v1/social-media/[platform]/posts/[postId] - Get post analytics
 * DELETE /api/v1/social-media/[platform]/posts/[postId] - Delete post
 * POST   /api/v1/social-media/[platform]/posts/[postId]/reply - Reply to post
 * POST   /api/v1/social-media/[platform]/posts/[postId]/like - Like post
 * POST   /api/v1/social-media/[platform]/posts/[postId]/repost - Repost
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { socialMediaService } from "@/lib/services/social-media";
import type { SocialPlatform, PostContent, PlatformPostOptions } from "@/lib/types/social-media";

type RouteContext = { params: Promise<{ platform: string; postId: string }> };

// =============================================================================
// GET - Get Post Analytics
// =============================================================================

export async function GET(request: NextRequest, ctx: RouteContext) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { platform, postId } = await ctx.params;
  const credentialId = request.nextUrl.searchParams.get("credentialId") ?? undefined;

  if (!socialMediaService.isPlatformSupported(platform as SocialPlatform)) {
    return NextResponse.json({ error: `Unsupported platform: ${platform}` }, { status: 400 });
  }

  const analytics = await socialMediaService.getPostAnalytics({
    organizationId: user.organization_id,
    platform: platform as SocialPlatform,
    postId,
    credentialId,
  });

  return NextResponse.json({ analytics });
}

// =============================================================================
// DELETE - Delete Post
// =============================================================================

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { platform, postId } = await ctx.params;
  const credentialId = request.nextUrl.searchParams.get("credentialId") ?? undefined;

  if (!socialMediaService.isPlatformSupported(platform as SocialPlatform)) {
    return NextResponse.json({ error: `Unsupported platform: ${platform}` }, { status: 400 });
  }

  const result = await socialMediaService.deletePost(
    user.organization_id,
    platform as SocialPlatform,
    postId,
    credentialId
  );

  if (!result.success) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json(result);
}


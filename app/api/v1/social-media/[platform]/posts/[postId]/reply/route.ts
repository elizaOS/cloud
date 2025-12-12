/**
 * Reply to Post API
 *
 * POST /api/v1/social-media/[platform]/posts/[postId]/reply
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { socialMediaService } from "@/lib/services/social-media";
import type { SocialPlatform, PostContent, PlatformPostOptions } from "@/lib/types/social-media";

type RouteContext = { params: Promise<{ platform: string; postId: string }> };

const ReplySchema = z.object({
  content: z.object({
    text: z.string().max(5000),
    media: z.array(z.object({
      type: z.enum(["image", "video", "gif"]),
      url: z.string().url().optional(),
      mimeType: z.string(),
      altText: z.string().optional(),
    })).max(4).optional(),
  }),
  platformOptions: z.record(z.unknown()).optional(),
  credentialId: z.string().optional(),
});

export async function POST(request: NextRequest, ctx: RouteContext) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { platform, postId } = await ctx.params;

  if (!socialMediaService.isPlatformSupported(platform as SocialPlatform)) {
    return NextResponse.json({ error: `Unsupported platform: ${platform}` }, { status: 400 });
  }

  const body = await request.json();
  const validated = ReplySchema.parse(body);

  const result = await socialMediaService.replyToPost(
    user.organization_id,
    platform as SocialPlatform,
    postId,
    validated.content as PostContent,
    validated.platformOptions as PlatformPostOptions,
    validated.credentialId
  );

  if (!result.success) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json(result);
}


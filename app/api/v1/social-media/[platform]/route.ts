/**
 * Platform-Specific Social Media API
 *
 * Platform-specific endpoints for social media operations.
 *
 * POST /api/v1/social-media/[platform] - Create post on specific platform
 * GET  /api/v1/social-media/[platform]/analytics - Get account analytics
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { socialMediaService } from "@/lib/services/social-media";
import type { SocialPlatform, PostContent, PlatformPostOptions } from "@/lib/types/social-media";

type RouteContext = { params: Promise<{ platform: string }> };

// =============================================================================
// SCHEMAS
// =============================================================================

const MediaAttachmentSchema = z.object({
  type: z.enum(["image", "video", "gif"]),
  url: z.string().url().optional(),
  base64: z.string().optional(),
  mimeType: z.string(),
  altText: z.string().optional(),
});

const PostContentSchema = z.object({
  text: z.string().max(5000),
  media: z.array(MediaAttachmentSchema).max(4).optional(),
  link: z.string().url().optional(),
  linkTitle: z.string().optional(),
  linkDescription: z.string().optional(),
  hashtags: z.array(z.string()).optional(),
  mentions: z.array(z.string()).optional(),
  replyToId: z.string().optional(),
  quoteId: z.string().optional(),
});

const CreatePostSchema = z.object({
  content: PostContentSchema,
  platformOptions: z.record(z.unknown()).optional(),
  credentialId: z.string().optional(),
});

// =============================================================================
// POST - Create Post on Platform
// =============================================================================

export async function POST(request: NextRequest, ctx: RouteContext) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { platform } = await ctx.params;

  // Validate platform
  if (!socialMediaService.isPlatformSupported(platform as SocialPlatform)) {
    return NextResponse.json({ error: `Unsupported platform: ${platform}` }, { status: 400 });
  }

  const body = await request.json();
  const validated = CreatePostSchema.parse(body);

  const result = await socialMediaService.createPost({
    organizationId: user.organization_id,
    userId: user.id,
    content: validated.content as PostContent,
    platforms: [platform as SocialPlatform],
    platformOptions: validated.platformOptions as PlatformPostOptions,
    credentialIds: validated.credentialId
      ? { [platform]: validated.credentialId }
      : undefined,
  });

  const platformResult = result.results[0];

  if (!platformResult.success) {
    return NextResponse.json(platformResult, { status: 400 });
  }

  return NextResponse.json(platformResult);
}

// =============================================================================
// GET - Get Account Analytics
// =============================================================================

export async function GET(request: NextRequest, ctx: RouteContext) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { platform } = await ctx.params;
  const credentialId = request.nextUrl.searchParams.get("credentialId") ?? undefined;

  if (!socialMediaService.isPlatformSupported(platform as SocialPlatform)) {
    return NextResponse.json({ error: `Unsupported platform: ${platform}` }, { status: 400 });
  }

  const analytics = await socialMediaService.getAccountAnalytics({
    organizationId: user.organization_id,
    platform: platform as SocialPlatform,
    credentialId,
  });

  return NextResponse.json({ analytics });
}

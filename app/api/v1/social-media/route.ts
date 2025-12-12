/**
 * Social Media API
 *
 * REST API for cross-platform social media posting and analytics.
 *
 * POST /api/v1/social-media - Create post(s) across platforms
 * GET  /api/v1/social-media/platforms - Get supported platforms
 * POST /api/v1/social-media/validate - Validate credentials
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { socialMediaService } from "@/lib/services/social-media";
import type { SocialPlatform, PostContent, PlatformPostOptions } from "@/lib/types/social-media";

// =============================================================================
// SCHEMAS
// =============================================================================

const SocialPlatformSchema = z.enum([
  "twitter",
  "bluesky",
  "discord",
  "telegram",
  "reddit",
  "facebook",
  "instagram",
  "tiktok",
  "linkedin",
]);

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
  platforms: z.array(SocialPlatformSchema).min(1).max(10),
  platformOptions: z.record(z.unknown()).optional(),
  credentialIds: z.record(z.string()).optional(),
  scheduledAt: z.string().datetime().optional(),
});

// =============================================================================
// POST - Create Post
// =============================================================================

export async function POST(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const body = await request.json();
  const validated = CreatePostSchema.parse(body);

  const result = await socialMediaService.createPost({
    organizationId: user.organization_id,
    userId: user.id,
    content: validated.content as PostContent,
    platforms: validated.platforms as SocialPlatform[],
    platformOptions: validated.platformOptions as PlatformPostOptions,
    credentialIds: validated.credentialIds as Partial<Record<SocialPlatform, string>>,
    scheduledAt: validated.scheduledAt ? new Date(validated.scheduledAt) : undefined,
  });

  return NextResponse.json({
    success: result.successCount > 0,
    results: result.results,
    summary: {
      totalPlatforms: result.totalPlatforms,
      successCount: result.successCount,
      failureCount: result.failureCount,
    },
  });
}

// =============================================================================
// GET - Get Supported Platforms
// =============================================================================

export async function GET(request: NextRequest) {
  await requireAuthOrApiKeyWithOrg(request);
  
  const platforms = socialMediaService.getSupportedPlatforms();

  return NextResponse.json({
    platforms,
    count: platforms.length,
    capabilities: platforms.map((p) => ({
      platform: p,
      features: {
        post: true,
        delete: true,
        reply: ["twitter", "bluesky", "reddit", "facebook", "linkedin", "discord"].includes(p),
        like: ["twitter", "bluesky", "reddit", "facebook", "linkedin", "discord"].includes(p),
        repost: ["twitter", "bluesky"].includes(p),
        analytics: ["twitter", "bluesky", "reddit", "facebook", "instagram", "tiktok", "linkedin"].includes(p),
        mediaUpload: true,
      },
    })),
  });
}

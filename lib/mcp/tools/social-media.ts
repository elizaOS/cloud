/**
 * Social Media MCP Tools
 *
 * MCP tools for cross-platform social media posting and analytics.
 * Integrates with the unified social media service.
 */

import { z } from "zod";
import { socialMediaService } from "@/lib/services/social-media";
import type { SocialPlatform, PostContent, PlatformPostOptions } from "@/lib/types/social-media";
import type { ToolResponse, AuthResultWithOrg } from "./types";

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
});

const SinglePlatformPostSchema = z.object({
  platform: SocialPlatformSchema,
  content: PostContentSchema,
  platformOptions: z.record(z.unknown()).optional(),
  credentialId: z.string().optional(),
});

const DeletePostSchema = z.object({
  platform: SocialPlatformSchema,
  postId: z.string(),
  credentialId: z.string().optional(),
});

const ReplySchema = z.object({
  platform: SocialPlatformSchema,
  postId: z.string(),
  content: PostContentSchema,
  platformOptions: z.record(z.unknown()).optional(),
  credentialId: z.string().optional(),
});

const AnalyticsSchema = z.object({
  platform: SocialPlatformSchema,
  postId: z.string().optional(),
  credentialId: z.string().optional(),
});

const StoreCredentialsSchema = z.object({
  platform: SocialPlatformSchema,
  credentials: z.object({
    accessToken: z.string().optional(),
    refreshToken: z.string().optional(),
    botToken: z.string().optional(),
    apiKey: z.string().optional(),
    apiSecret: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    email: z.string().optional(),
    handle: z.string().optional(),
    appPassword: z.string().optional(),
    webhookUrl: z.string().optional(),
  }),
});

// =============================================================================
// HELPERS
// =============================================================================

function successResponse(data: unknown): ToolResponse {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

function errorResponse(error: unknown): ToolResponse {
  const message = error instanceof Error ? error.message : "Unknown error";
  return {
    content: [{ type: "text", text: JSON.stringify({ error: message }, null, 2) }],
    isError: true,
  };
}

// =============================================================================
// TOOL HANDLERS
// =============================================================================

export async function handleCreatePost(
  params: z.infer<typeof CreatePostSchema>,
  auth: AuthResultWithOrg
): Promise<ToolResponse> {
  const result = await socialMediaService.createPost({
    organizationId: auth.user.organization_id,
    userId: auth.user.id,
    content: params.content as PostContent,
    platforms: params.platforms as SocialPlatform[],
    platformOptions: params.platformOptions as PlatformPostOptions,
    credentialIds: params.credentialIds as Partial<Record<SocialPlatform, string>>,
  });

  return successResponse({
    success: result.successCount > 0,
    results: result.results,
    summary: {
      totalPlatforms: result.totalPlatforms,
      successCount: result.successCount,
      failureCount: result.failureCount,
    },
  });
}

export async function handlePostToPlatform(
  params: z.infer<typeof SinglePlatformPostSchema>,
  auth: AuthResultWithOrg
): Promise<ToolResponse> {
  const result = await socialMediaService.createPost({
    organizationId: auth.user.organization_id,
    userId: auth.user.id,
    content: params.content as PostContent,
    platforms: [params.platform as SocialPlatform],
    platformOptions: params.platformOptions as PlatformPostOptions,
    credentialIds: params.credentialId
      ? { [params.platform]: params.credentialId }
      : undefined,
  });

  const platformResult = result.results[0];
  return successResponse(platformResult);
}

export async function handleDeletePost(
  params: z.infer<typeof DeletePostSchema>,
  auth: AuthResultWithOrg
): Promise<ToolResponse> {
  const result = await socialMediaService.deletePost(
    auth.user.organization_id,
    params.platform as SocialPlatform,
    params.postId,
    params.credentialId
  );

  return successResponse(result);
}

export async function handleReplyToPost(
  params: z.infer<typeof ReplySchema>,
  auth: AuthResultWithOrg
): Promise<ToolResponse> {
  const result = await socialMediaService.replyToPost(
    auth.user.organization_id,
    params.platform as SocialPlatform,
    params.postId,
    params.content as PostContent,
    params.platformOptions as PlatformPostOptions,
    params.credentialId
  );

  return successResponse(result);
}

export async function handleLikePost(
  params: { platform: string; postId: string; credentialId?: string },
  auth: AuthResultWithOrg
): Promise<ToolResponse> {
  const result = await socialMediaService.likePost(
    auth.user.organization_id,
    params.platform as SocialPlatform,
    params.postId,
    params.credentialId
  );

  return successResponse(result);
}

export async function handleRepost(
  params: { platform: string; postId: string; credentialId?: string },
  auth: AuthResultWithOrg
): Promise<ToolResponse> {
  const result = await socialMediaService.repost(
    auth.user.organization_id,
    params.platform as SocialPlatform,
    params.postId,
    params.credentialId
  );

  return successResponse(result);
}

export async function handleGetPostAnalytics(
  params: z.infer<typeof AnalyticsSchema>,
  auth: AuthResultWithOrg
): Promise<ToolResponse> {
  if (!params.postId) {
    return errorResponse(new Error("postId required for post analytics"));
  }

  const result = await socialMediaService.getPostAnalytics({
    organizationId: auth.user.organization_id,
    platform: params.platform as SocialPlatform,
    postId: params.postId,
    credentialId: params.credentialId,
  });

  if (!result) {
    return successResponse({ analytics: null, message: "Analytics not available" });
  }

  return successResponse({ analytics: result });
}

export async function handleGetAccountAnalytics(
  params: z.infer<typeof AnalyticsSchema>,
  auth: AuthResultWithOrg
): Promise<ToolResponse> {
  const result = await socialMediaService.getAccountAnalytics({
    organizationId: auth.user.organization_id,
    platform: params.platform as SocialPlatform,
    credentialId: params.credentialId,
  });

  if (!result) {
    return successResponse({ analytics: null, message: "Analytics not available" });
  }

  return successResponse({ analytics: result });
}

export async function handleValidateCredentials(
  params: { platform: string; credentialId?: string },
  auth: AuthResultWithOrg
): Promise<ToolResponse> {
  const result = await socialMediaService.validateCredentials(
    auth.user.organization_id,
    params.platform as SocialPlatform,
    params.credentialId
  );

  return successResponse(result);
}

export async function handleStoreCredentials(
  params: z.infer<typeof StoreCredentialsSchema>,
  auth: AuthResultWithOrg
): Promise<ToolResponse> {
  await socialMediaService.storeCredentials(
    auth.user.organization_id,
    auth.user.id,
    params.platform as SocialPlatform,
    params.credentials
  );

  return successResponse({
    success: true,
    platform: params.platform,
    message: "Credentials stored successfully",
  });
}

export function handleGetSupportedPlatforms(): ToolResponse {
  const platforms = socialMediaService.getSupportedPlatforms();
  return successResponse({
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

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const socialMediaTools = [
  {
    name: "social_media_create_post",
    description:
      "Create a post across multiple social media platforms simultaneously. " +
      "Supports text, images, videos, and links. " +
      "Platforms: Twitter, Bluesky, Discord, Telegram, Reddit, Facebook, Instagram, TikTok, LinkedIn.",
    inputSchema: CreatePostSchema,
    handler: handleCreatePost,
  },
  {
    name: "social_media_post_to_platform",
    description:
      "Create a post on a single social media platform. " +
      "Use this when you need platform-specific options.",
    inputSchema: SinglePlatformPostSchema,
    handler: handlePostToPlatform,
  },
  {
    name: "social_media_delete_post",
    description: "Delete a post from a social media platform.",
    inputSchema: DeletePostSchema,
    handler: handleDeletePost,
  },
  {
    name: "social_media_reply",
    description:
      "Reply to a post on a social media platform. " +
      "Supported on Twitter, Bluesky, Reddit, Facebook, LinkedIn, Discord.",
    inputSchema: ReplySchema,
    handler: handleReplyToPost,
  },
  {
    name: "social_media_like",
    description:
      "Like or upvote a post on a social media platform. " +
      "Supported on Twitter, Bluesky, Reddit, Facebook, LinkedIn, Discord.",
    inputSchema: z.object({
      platform: SocialPlatformSchema,
      postId: z.string(),
      credentialId: z.string().optional(),
    }),
    handler: handleLikePost,
  },
  {
    name: "social_media_repost",
    description:
      "Repost, retweet, or share a post on a social media platform. " +
      "Supported on Twitter and Bluesky.",
    inputSchema: z.object({
      platform: SocialPlatformSchema,
      postId: z.string(),
      credentialId: z.string().optional(),
    }),
    handler: handleRepost,
  },
  {
    name: "social_media_get_post_analytics",
    description:
      "Get analytics/metrics for a specific post (likes, comments, shares, impressions). " +
      "Available on most platforms except Discord and Telegram.",
    inputSchema: AnalyticsSchema,
    handler: handleGetPostAnalytics,
  },
  {
    name: "social_media_get_account_analytics",
    description:
      "Get account-level analytics (followers, following, total posts). " +
      "Available on most platforms.",
    inputSchema: AnalyticsSchema,
    handler: handleGetAccountAnalytics,
  },
  {
    name: "social_media_validate_credentials",
    description:
      "Validate stored credentials for a social media platform and get account info.",
    inputSchema: z.object({
      platform: SocialPlatformSchema,
      credentialId: z.string().optional(),
    }),
    handler: handleValidateCredentials,
  },
  {
    name: "social_media_store_credentials",
    description:
      "Store credentials for a social media platform securely. " +
      "Different platforms require different credentials: " +
      "Twitter (accessToken), Bluesky (handle + appPassword), " +
      "Discord (botToken or webhookUrl), Telegram (botToken), " +
      "Reddit (apiKey, apiSecret, username, password), " +
      "Meta/Facebook/Instagram (accessToken), TikTok (accessToken), " +
      "LinkedIn (accessToken).",
    inputSchema: StoreCredentialsSchema,
    handler: handleStoreCredentials,
  },
  {
    name: "social_media_get_supported_platforms",
    description:
      "Get a list of all supported social media platforms and their capabilities.",
    inputSchema: z.object({}),
    handler: handleGetSupportedPlatforms,
  },
];

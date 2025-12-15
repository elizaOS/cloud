import { z } from "zod";
import { socialMediaService } from "@/lib/services/social-media";
import {
  SocialPlatformSchema,
  PostContentSchema,
  type SocialPlatform,
  type PostContent,
  type PlatformPostOptions,
} from "@/lib/types/social-media";
import type { ToolResponse, AuthResultWithOrg } from "./types";

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

const PostActionSchema = z.object({
  platform: SocialPlatformSchema,
  postId: z.string(),
  credentialId: z.string().optional(),
});

const ReplySchema = PostActionSchema.extend({
  content: PostContentSchema,
  platformOptions: z.record(z.unknown()).optional(),
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
    instanceUrl: z.string().optional(), // Mastodon instance URL
  }),
});

function ok(data: unknown): ToolResponse {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function err(error: unknown): ToolResponse {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          { error: error instanceof Error ? error.message : "Unknown error" },
          null,
          2,
        ),
      },
    ],
    isError: true,
  };
}

export async function handleCreatePost(
  params: z.infer<typeof CreatePostSchema>,
  auth: AuthResultWithOrg,
): Promise<ToolResponse> {
  const result = await socialMediaService.createPost({
    organizationId: auth.user.organization_id,
    userId: auth.user.id,
    content: params.content as PostContent,
    platforms: params.platforms as SocialPlatform[],
    platformOptions: params.platformOptions as PlatformPostOptions,
    credentialIds: params.credentialIds as Partial<
      Record<SocialPlatform, string>
    >,
  });

  return ok({
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
  auth: AuthResultWithOrg,
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
  return ok(result.results[0]);
}

export async function handleDeletePost(
  params: z.infer<typeof PostActionSchema>,
  auth: AuthResultWithOrg,
): Promise<ToolResponse> {
  return ok(
    await socialMediaService.deletePost(
      auth.user.organization_id,
      params.platform as SocialPlatform,
      params.postId,
      params.credentialId,
    ),
  );
}

export async function handleReplyToPost(
  params: z.infer<typeof ReplySchema>,
  auth: AuthResultWithOrg,
): Promise<ToolResponse> {
  return ok(
    await socialMediaService.replyToPost(
      auth.user.organization_id,
      params.platform as SocialPlatform,
      params.postId,
      params.content as PostContent,
      params.platformOptions as PlatformPostOptions,
      params.credentialId,
    ),
  );
}

export async function handleLikePost(
  params: z.infer<typeof PostActionSchema>,
  auth: AuthResultWithOrg,
): Promise<ToolResponse> {
  return ok(
    await socialMediaService.likePost(
      auth.user.organization_id,
      params.platform as SocialPlatform,
      params.postId,
      params.credentialId,
    ),
  );
}

export async function handleRepost(
  params: z.infer<typeof PostActionSchema>,
  auth: AuthResultWithOrg,
): Promise<ToolResponse> {
  return ok(
    await socialMediaService.repost(
      auth.user.organization_id,
      params.platform as SocialPlatform,
      params.postId,
      params.credentialId,
    ),
  );
}

export async function handleGetPostAnalytics(
  params: z.infer<typeof AnalyticsSchema>,
  auth: AuthResultWithOrg,
): Promise<ToolResponse> {
  if (!params.postId)
    return err(new Error("postId required for post analytics"));

  const result = await socialMediaService.getPostAnalytics({
    organizationId: auth.user.organization_id,
    platform: params.platform as SocialPlatform,
    postId: params.postId,
    credentialId: params.credentialId,
  });

  return ok(result ? { analytics: result } : { analytics: null });
}

export async function handleGetAccountAnalytics(
  params: z.infer<typeof AnalyticsSchema>,
  auth: AuthResultWithOrg,
): Promise<ToolResponse> {
  const result = await socialMediaService.getAccountAnalytics({
    organizationId: auth.user.organization_id,
    platform: params.platform as SocialPlatform,
    credentialId: params.credentialId,
  });

  return ok(result ? { analytics: result } : { analytics: null });
}

export async function handleValidateCredentials(
  params: { platform: string; credentialId?: string },
  auth: AuthResultWithOrg,
): Promise<ToolResponse> {
  return ok(
    await socialMediaService.validateCredentials(
      auth.user.organization_id,
      params.platform as SocialPlatform,
      params.credentialId,
    ),
  );
}

export async function handleStoreCredentials(
  params: z.infer<typeof StoreCredentialsSchema>,
  auth: AuthResultWithOrg,
): Promise<ToolResponse> {
  await socialMediaService.storeCredentials(
    auth.user.organization_id,
    auth.user.id,
    params.platform as SocialPlatform,
    params.credentials,
  );
  return ok({ success: true, platform: params.platform });
}

export function handleGetSupportedPlatforms(): ToolResponse {
  const platforms = socialMediaService.getSupportedPlatforms();
  return ok({
    platforms,
    count: platforms.length,
    capabilities: platforms.map((p) => ({
      platform: p,
      features: {
        post: true,
        delete: true,
        reply: [
          "twitter",
          "bluesky",
          "reddit",
          "facebook",
          "linkedin",
          "discord",
          "mastodon",
        ].includes(p),
        like: [
          "twitter",
          "bluesky",
          "reddit",
          "facebook",
          "linkedin",
          "discord",
          "mastodon",
        ].includes(p),
        repost: ["twitter", "bluesky", "mastodon"].includes(p),
        analytics: [
          "twitter",
          "bluesky",
          "reddit",
          "facebook",
          "instagram",
          "tiktok",
          "linkedin",
          "mastodon",
        ].includes(p),
      },
    })),
  });
}

export const socialMediaTools = [
  {
    name: "social_media_create_post",
    description:
      "Create a post across multiple social media platforms. Supports text, images, videos, links.",
    inputSchema: CreatePostSchema,
    handler: handleCreatePost,
  },
  {
    name: "social_media_post_to_platform",
    description:
      "Create a post on a single platform with platform-specific options.",
    inputSchema: SinglePlatformPostSchema,
    handler: handlePostToPlatform,
  },
  {
    name: "social_media_delete_post",
    description: "Delete a post from a social media platform.",
    inputSchema: PostActionSchema,
    handler: handleDeletePost,
  },
  {
    name: "social_media_reply",
    description:
      "Reply to a post. Supported: Twitter, Bluesky, Reddit, Facebook, LinkedIn, Discord.",
    inputSchema: ReplySchema,
    handler: handleReplyToPost,
  },
  {
    name: "social_media_like",
    description:
      "Like/upvote a post. Supported: Twitter, Bluesky, Reddit, Facebook, LinkedIn, Discord.",
    inputSchema: PostActionSchema,
    handler: handleLikePost,
  },
  {
    name: "social_media_repost",
    description: "Repost/retweet a post. Supported: Twitter, Bluesky.",
    inputSchema: PostActionSchema,
    handler: handleRepost,
  },
  {
    name: "social_media_get_post_analytics",
    description:
      "Get analytics for a post (likes, comments, shares, impressions).",
    inputSchema: AnalyticsSchema,
    handler: handleGetPostAnalytics,
  },
  {
    name: "social_media_get_account_analytics",
    description: "Get account analytics (followers, following, total posts).",
    inputSchema: AnalyticsSchema,
    handler: handleGetAccountAnalytics,
  },
  {
    name: "social_media_validate_credentials",
    description: "Validate stored credentials and get account info.",
    inputSchema: z.object({
      platform: SocialPlatformSchema,
      credentialId: z.string().optional(),
    }),
    handler: handleValidateCredentials,
  },
  {
    name: "social_media_store_credentials",
    description:
      "Store credentials for a platform. Required fields vary by platform.",
    inputSchema: StoreCredentialsSchema,
    handler: handleStoreCredentials,
  },
  {
    name: "social_media_get_supported_platforms",
    description: "List supported platforms and their capabilities.",
    inputSchema: z.object({}),
    handler: handleGetSupportedPlatforms,
  },
];

/**
 * Social Media Types
 *
 * Unified types for cross-platform social media posting and analytics.
 * Supports TikTok, Facebook, Instagram, X (Twitter), Reddit, Telegram,
 * Discord, Bluesky, and LinkedIn.
 */

// =============================================================================
// PLATFORM TYPES
// =============================================================================

export type SocialPlatform =
  | "twitter"
  | "bluesky"
  | "discord"
  | "telegram"
  | "reddit"
  | "facebook"
  | "instagram"
  | "tiktok"
  | "linkedin"
  | "mastodon";

export type PostStatus = "pending" | "published" | "failed" | "scheduled";

// =============================================================================
// CONTENT TYPES
// =============================================================================

export interface MediaAttachment {
  type: "image" | "video" | "gif";
  url?: string;
  data?: Buffer;
  base64?: string;
  mimeType: string;
  altText?: string;
  thumbnailUrl?: string;
}

export interface PostContent {
  text: string;
  media?: MediaAttachment[];
  link?: string;
  linkTitle?: string;
  linkDescription?: string;
  hashtags?: string[];
  mentions?: string[];
  replyToId?: string;
  quoteId?: string;
}

export interface ScheduledPost {
  content: PostContent;
  scheduledAt: Date;
  platforms: SocialPlatform[];
  timezone?: string;
}

// =============================================================================
// PLATFORM-SPECIFIC OPTIONS
// =============================================================================

export interface TwitterPostOptions {
  replySettings?: "everyone" | "mentionedUsers" | "following";
  quoteTweetId?: string;
  pollOptions?: string[];
  pollDurationMinutes?: number;
}

export interface BlueskyPostOptions {
  languages?: string[];
  labels?: string[];
  threadGate?: {
    allowMentioned?: boolean;
    allowFollowing?: boolean;
    allowLists?: string[];
  };
}

export interface DiscordPostOptions {
  channelId: string;
  serverId?: string;
  webhookUrl?: string;
  embed?: {
    title?: string;
    description?: string;
    url?: string;
    color?: number;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    thumbnail?: { url: string };
    image?: { url: string };
    footer?: { text: string; icon_url?: string };
  };
  components?: Array<{
    type: number;
    components: Array<{
      type: number;
      label: string;
      style: number;
      url?: string;
      custom_id?: string;
    }>;
  }>;
}

export interface TelegramPostOptions {
  chatId: string | number;
  parseMode?: "HTML" | "Markdown" | "MarkdownV2";
  disableWebPagePreview?: boolean;
  disableNotification?: boolean;
  replyToMessageId?: number;
  inlineKeyboard?: Array<
    Array<{
      text: string;
      url?: string;
      callback_data?: string;
    }>
  >;
}

export interface RedditPostOptions {
  subreddit: string;
  title: string;
  flair?: string;
  nsfw?: boolean;
  spoiler?: boolean;
  sendReplies?: boolean;
}

export interface FacebookPostOptions {
  pageId: string;
  targeting?: {
    countries?: string[];
    cities?: string[];
    ageMin?: number;
    ageMax?: number;
  };
  published?: boolean;
  scheduledPublishTime?: number;
}

export interface InstagramPostOptions {
  accountId: string;
  shareToFeed?: boolean;
  shareToStory?: boolean;
  locationId?: string;
  userTags?: Array<{ userId: string; x: number; y: number }>;
  productTags?: Array<{ productId: string; x: number; y: number }>;
}

export interface TikTokPostOptions {
  privacyLevel?: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "SELF_ONLY";
  disableDuet?: boolean;
  disableStitch?: boolean;
  disableComment?: boolean;
  videoCoverTimestampMs?: number;
  brandContentToggle?: boolean;
  brandOrganicToggle?: boolean;
}

export interface LinkedInPostOptions {
  visibility?: "PUBLIC" | "CONNECTIONS" | "LOGGED_IN";
  organizationId?: string;
  shareToCompanyPage?: boolean;
}

export interface MastodonPostOptions {
  instanceUrl: string;
  visibility?: "public" | "unlisted" | "private" | "direct";
  sensitive?: boolean;
  spoilerText?: string;
  language?: string;
  pollOptions?: string[];
  pollExpiresIn?: number;
}

export type PlatformPostOptions = {
  twitter?: TwitterPostOptions;
  bluesky?: BlueskyPostOptions;
  discord?: DiscordPostOptions;
  telegram?: TelegramPostOptions;
  reddit?: RedditPostOptions;
  facebook?: FacebookPostOptions;
  instagram?: InstagramPostOptions;
  tiktok?: TikTokPostOptions;
  linkedin?: LinkedInPostOptions;
  mastodon?: MastodonPostOptions;
};

// =============================================================================
// POST RESULTS
// =============================================================================

export interface PostResult {
  platform: SocialPlatform;
  success: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
  errorCode?: string;
  rateLimited?: boolean;
  retryAfter?: number;
  metadata?: Record<string, unknown>;
}

export interface MultiPlatformPostResult {
  results: PostResult[];
  successful: PostResult[];
  failed: PostResult[];
  totalPlatforms: number;
  successCount: number;
  failureCount: number;
}

// =============================================================================
// ANALYTICS TYPES
// =============================================================================

export interface PostAnalytics {
  platform: SocialPlatform;
  postId: string;
  metrics: {
    impressions?: number;
    reach?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    reposts?: number;
    saves?: number;
    clicks?: number;
    engagementRate?: number;
    videoViews?: number;
    videoWatchTime?: number;
  };
  fetchedAt: Date;
}

export interface AccountAnalytics {
  platform: SocialPlatform;
  accountId: string;
  metrics: {
    followers?: number;
    following?: number;
    totalPosts?: number;
    profileViews?: number;
    impressionsLast30Days?: number;
    engagementRate?: number;
  };
  fetchedAt: Date;
}

// =============================================================================
// CREDENTIAL TYPES
// =============================================================================

export interface SocialCredentials {
  platform: SocialPlatform;

  // OAuth tokens
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;

  // API keys (for platforms like Reddit)
  apiKey?: string;
  apiSecret?: string;

  // Bot tokens (for Discord, Telegram)
  botToken?: string;

  // Username/password (for Twitter scraper mode)
  username?: string;
  password?: string;
  email?: string;
  twoFactorSecret?: string;

  // App passwords (for Bluesky)
  appPassword?: string;
  handle?: string;

  // Webhook URLs (for Discord)
  webhookUrl?: string;

  // Platform-specific
  pageId?: string;
  accountId?: string;
  serverId?: string;
  channelId?: string;
}

// =============================================================================
// PROVIDER INTERFACE
// =============================================================================

export interface SocialMediaProvider {
  platform: SocialPlatform;

  /**
   * Validate credentials format (sync, does not call API)
   */
  validateCredentialsFormat(credentials: Partial<SocialCredentials>): void;

  /**
   * Validate credentials and return account info
   */
  validateCredentials(credentials: SocialCredentials): Promise<{
    valid: boolean;
    accountId?: string;
    username?: string;
    displayName?: string;
    avatarUrl?: string;
    error?: string;
  }>;

  /**
   * Create a post
   */
  createPost(
    credentials: SocialCredentials,
    content: PostContent,
    options?: PlatformPostOptions
  ): Promise<PostResult>;

  /**
   * Delete a post
   */
  deletePost?(
    credentials: SocialCredentials,
    postId: string
  ): Promise<{ success: boolean; error?: string }>;

  /**
   * Get analytics for a specific post
   */
  getPostAnalytics?(
    credentials: SocialCredentials,
    postId: string
  ): Promise<PostAnalytics | null>;

  /**
   * Get account-level analytics
   */
  getAccountAnalytics?(
    credentials: SocialCredentials
  ): Promise<AccountAnalytics | null>;

  /**
   * Upload media and return a media ID for use in posts
   */
  uploadMedia?(
    credentials: SocialCredentials,
    media: MediaAttachment
  ): Promise<{ mediaId: string; url?: string }>;

  /**
   * Reply to a post
   */
  replyToPost?(
    credentials: SocialCredentials,
    postId: string,
    content: PostContent,
    options?: PlatformPostOptions
  ): Promise<PostResult>;

  /**
   * Like a post
   */
  likePost?(
    credentials: SocialCredentials,
    postId: string
  ): Promise<{ success: boolean; error?: string }>;

  /**
   * Repost/retweet/share a post
   */
  repost?(
    credentials: SocialCredentials,
    postId: string
  ): Promise<PostResult>;
}

// =============================================================================
// SERVICE TYPES
// =============================================================================

export interface CreatePostInput {
  organizationId: string;
  userId?: string;
  content: PostContent;
  platforms: SocialPlatform[];
  platformOptions?: PlatformPostOptions;
  credentialIds?: Partial<Record<SocialPlatform, string>>;
  scheduledAt?: Date;
}

export interface GetAnalyticsInput {
  organizationId: string;
  platform: SocialPlatform;
  postId?: string;
  credentialId?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

export const SUPPORTED_PLATFORMS: SocialPlatform[] = [
  "twitter",
  "bluesky",
  "discord",
  "telegram",
  "reddit",
  "facebook",
  "instagram",
  "tiktok",
  "linkedin",
  "mastodon",
];

export interface PlatformCapability {
  supportsText: boolean;
  supportsImages: boolean;
  supportsVideo: boolean;
  supportsLinks: boolean;
  supportsPolls: boolean;
  supportsScheduling: boolean;
  supportsAnalytics: boolean;
  maxTextLength: number;
  maxImages: number;
  maxVideoLength?: number;
  maxVideoDuration?: number;
}

export const PLATFORM_CAPABILITIES: Record<SocialPlatform, PlatformCapability> = {
  twitter: {
    supportsText: true,
    supportsImages: true,
    supportsVideo: true,
    supportsLinks: true,
    supportsPolls: true,
    supportsScheduling: true,
    supportsAnalytics: true,
    maxTextLength: 280,
    maxImages: 4,
    maxVideoDuration: 140,
  },
  bluesky: {
    supportsText: true,
    supportsImages: true,
    supportsVideo: false,
    supportsLinks: true,
    supportsPolls: false,
    supportsScheduling: false,
    supportsAnalytics: true,
    maxTextLength: 300,
    maxImages: 4,
  },
  discord: {
    supportsText: true,
    supportsImages: true,
    supportsVideo: true,
    supportsLinks: true,
    supportsPolls: false,
    supportsScheduling: false,
    supportsAnalytics: false,
    maxTextLength: 2000,
    maxImages: 10,
  },
  telegram: {
    supportsText: true,
    supportsImages: true,
    supportsVideo: true,
    supportsLinks: true,
    supportsPolls: true,
    supportsScheduling: false,
    supportsAnalytics: false,
    maxTextLength: 4096,
    maxImages: 10,
  },
  reddit: {
    supportsText: true,
    supportsImages: true,
    supportsVideo: true,
    supportsLinks: true,
    supportsPolls: true,
    supportsScheduling: false,
    supportsAnalytics: true,
    maxTextLength: 40000,
    maxImages: 20,
  },
  facebook: {
    supportsText: true,
    supportsImages: true,
    supportsVideo: true,
    supportsLinks: true,
    supportsPolls: false,
    supportsScheduling: true,
    supportsAnalytics: true,
    maxTextLength: 63206,
    maxImages: 10,
  },
  instagram: {
    supportsText: true,
    supportsImages: true,
    supportsVideo: true,
    supportsLinks: false,
    supportsPolls: false,
    supportsScheduling: false,
    supportsAnalytics: true,
    maxTextLength: 2200,
    maxImages: 10,
    maxVideoDuration: 90,
  },
  tiktok: {
    supportsText: false,
    supportsImages: false,
    supportsVideo: true,
    supportsLinks: false,
    supportsPolls: false,
    supportsScheduling: false,
    supportsAnalytics: true,
    maxTextLength: 2200,
    maxImages: 0,
    maxVideoDuration: 600,
  },
  linkedin: {
    supportsText: true,
    supportsImages: true,
    supportsVideo: true,
    supportsLinks: true,
    supportsPolls: true,
    supportsScheduling: false,
    supportsAnalytics: true,
    maxTextLength: 3000,
    maxImages: 9,
  },
  mastodon: {
    supportsText: true,
    supportsImages: true,
    supportsVideo: true,
    supportsLinks: true,
    supportsPolls: true,
    supportsScheduling: false,
    supportsAnalytics: false,
    maxTextLength: 500,
    maxImages: 4,
  },
};

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validatePostContent(
  content: Partial<PostContent>,
  platform: SocialPlatform
): ValidationResult {
  const capabilities = PLATFORM_CAPABILITIES[platform];

  // Check if platform requires video (TikTok)
  if (!capabilities.supportsText && !content.media?.some(m => m.type === "video")) {
    return { valid: false, error: `${platform} requires video content` };
  }

  // Validate text length
  if (content.text) {
    if (content.text.length > capabilities.maxTextLength) {
      return {
        valid: false,
        error: `Text length ${content.text.length} exceeds ${platform} limit of ${capabilities.maxTextLength}`,
      };
    }
  }

  // Validate media count
  if (content.media) {
    const imageCount = content.media.filter(m => m.type === "image").length;
    if (imageCount > capabilities.maxImages) {
      return {
        valid: false,
        error: `Number of images ${imageCount} exceeds ${platform} limit of ${capabilities.maxImages}`,
      };
    }
  }

  return { valid: true };
}

export function validatePlatformOptions(
  platform: SocialPlatform,
  options: Record<string, unknown>
): ValidationResult {
  // Platform-specific validation
  switch (platform) {
    case "reddit":
      if (!options.subreddit) {
        return { valid: false, error: "Reddit requires a subreddit" };
      }
      break;
    case "discord":
      if (!options.channelId && !options.webhookUrl) {
        return { valid: false, error: "Discord requires channelId or webhookUrl" };
      }
      break;
    case "telegram":
      if (!options.chatId) {
        return { valid: false, error: "Telegram requires chatId" };
      }
      break;
  }

  return { valid: true };
}

// =============================================================================
// RESULT HELPERS
// =============================================================================

export function createSuccessResult(
  platform: SocialPlatform,
  postId: string,
  url?: string,
  metadata?: Record<string, unknown>
): PostResult {
  return {
    platform,
    success: true,
    postId,
    postUrl: url,
    metadata,
  };
}

export function createErrorResult(
  platform: SocialPlatform,
  error: string,
  errorCode?: string,
  rateLimited?: boolean,
  retryAfter?: number
): PostResult {
  return {
    platform,
    success: false,
    error,
    errorCode,
    rateLimited,
    retryAfter,
  };
}

export function aggregateResults(results: PostResult[]): MultiPlatformPostResult {
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  return {
    results,
    successful,
    failed,
    totalPlatforms: results.length,
    successCount: successful.length,
    failureCount: failed.length,
  };
}

// =============================================================================
// ANALYTICS VALIDATION
// =============================================================================

export function isValidPostAnalytics(data: Record<string, unknown>): boolean {
  return (
    typeof data.postId === "string" &&
    typeof data.platform === "string" &&
    data.fetchedAt instanceof Date
  );
}

export function isValidAccountAnalytics(data: Record<string, unknown>): boolean {
  return (
    typeof data.platform === "string" &&
    data.fetchedAt instanceof Date
  );
}

// =============================================================================
// CREDIT CALCULATION
// =============================================================================

const BASE_POST_CREDITS = 10;
const MEDIA_CREDITS_PER_ITEM = 5;
const PLATFORM_MULTIPLIER: Partial<Record<SocialPlatform, number>> = {
  tiktok: 2.0,
  instagram: 1.5,
  linkedin: 1.5,
};

export function calculatePostCredits(
  platforms: SocialPlatform[],
  content: Partial<PostContent>
): number {
  let totalCredits = 0;

  for (const platform of platforms) {
    let platformCredits = BASE_POST_CREDITS;

    // Add media credits
    if (content.media) {
      platformCredits += content.media.length * MEDIA_CREDITS_PER_ITEM;
    }

    // Apply platform multiplier
    const multiplier = PLATFORM_MULTIPLIER[platform] || 1.0;
    platformCredits = Math.ceil(platformCredits * multiplier);

    totalCredits += platformCredits;
  }

  return totalCredits;
}

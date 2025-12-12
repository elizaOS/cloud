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

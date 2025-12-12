/**
 * Social Media Service
 *
 * Unified service for cross-platform social media posting and analytics.
 * Provides a single interface for posting to multiple social platforms.
 */

import { logger } from "@/lib/utils/logger";
import { secretsService } from "@/lib/services/secrets";
import { creditsService } from "@/lib/services/credits";
import { db } from "@/db";
import { platformCredentials } from "@/db/schemas/platform-credentials";
import { eq, and } from "drizzle-orm";
import type {
  SocialPlatform,
  SocialMediaProvider,
  PostContent,
  PostResult,
  MultiPlatformPostResult,
  PlatformPostOptions,
  SocialCredentials,
  CreatePostInput,
  GetAnalyticsInput,
  PostAnalytics,
  AccountAnalytics,
  MediaAttachment,
} from "@/lib/types/social-media";

// Import providers
import { twitterProvider } from "./providers/twitter";
import { blueskyProvider } from "./providers/bluesky";
import { discordProvider } from "./providers/discord";
import { telegramProvider } from "./providers/telegram";
import { redditProvider } from "./providers/reddit";
import { metaProvider } from "./providers/meta";
import { tiktokProvider } from "./providers/tiktok";
import { linkedinProvider } from "./providers/linkedin";

// =============================================================================
// CONSTANTS
// =============================================================================

const POST_CREDIT_COST = 0.01; // $0.01 per post per platform

// =============================================================================
// PROVIDER REGISTRY
// =============================================================================

const providers: Record<SocialPlatform, SocialMediaProvider | null> = {
  twitter: twitterProvider,
  bluesky: blueskyProvider,
  discord: discordProvider,
  telegram: telegramProvider,
  reddit: redditProvider,
  facebook: metaProvider,
  instagram: metaProvider,
  tiktok: tiktokProvider,
  linkedin: linkedinProvider,
  mastodon: null, // Coming soon
};

// =============================================================================
// SERVICE CLASS
// =============================================================================

class SocialMediaService {
  /**
   * Get all supported platforms
   */
  getSupportedPlatforms(): SocialPlatform[] {
    return Object.entries(providers)
      .filter(([_, provider]) => provider !== null)
      .map(([platform]) => platform as SocialPlatform);
  }

  /**
   * Check if a platform is supported
   */
  isPlatformSupported(platform: SocialPlatform): boolean {
    return providers[platform] !== null;
  }

  /**
   * Get provider for a platform
   */
  getProvider(platform: SocialPlatform): SocialMediaProvider {
    const provider = providers[platform];
    if (!provider) {
      throw new Error(`Platform ${platform} is not currently supported`);
    }
    return provider;
  }

  /**
   * Get credentials for a platform from platform_credentials table
   */
  async getCredentialsForPlatform(
    organizationId: string,
    platform: SocialPlatform,
    credentialId?: string
  ): Promise<SocialCredentials | null> {
    // Map our platform names to the credential types in the database
    const platformMap: Record<SocialPlatform, string> = {
      twitter: "twitter",
      bluesky: "bluesky",
      discord: "discord",
      telegram: "telegram",
      reddit: "reddit",
      facebook: "facebook",
      instagram: "instagram",
      tiktok: "tiktok",
      linkedin: "linkedin",
      mastodon: "mastodon",
    };

    const dbPlatform = platformMap[platform];

    // Build query conditions
    const conditions = [
      eq(platformCredentials.organization_id, organizationId),
      eq(platformCredentials.status, "active"),
    ];

    if (credentialId) {
      conditions.push(eq(platformCredentials.id, credentialId));
    }

    // Query for matching credential
    const [credential] = await db
      .select()
      .from(platformCredentials)
      .where(and(...conditions))
      .limit(1);

    if (!credential) {
      // Try to get from secrets directly for platforms using direct secrets
      return this.getCredentialsFromSecrets(organizationId, platform);
    }

    // Get tokens from secrets
    const accessToken = credential.access_token_secret_id
      ? await secretsService.getDecryptedValue(
          credential.access_token_secret_id,
          organizationId
        )
      : undefined;

    const refreshToken = credential.refresh_token_secret_id
      ? await secretsService.getDecryptedValue(
          credential.refresh_token_secret_id,
          organizationId
        )
      : undefined;

    return {
      platform,
      accessToken,
      refreshToken,
      tokenExpiresAt: credential.token_expires_at ?? undefined,
      username: credential.platform_username ?? undefined,
      accountId: credential.platform_user_id,
    };
  }

  /**
   * Get credentials from secrets store (for platforms not using OAuth)
   */
  private async getCredentialsFromSecrets(
    organizationId: string,
    platform: SocialPlatform
  ): Promise<SocialCredentials | null> {
    const prefix = platform.toUpperCase();

    switch (platform) {
      case "twitter": {
        const username = await secretsService.get(organizationId, `${prefix}_USERNAME`);
        const password = await secretsService.get(organizationId, `${prefix}_PASSWORD`);
        const email = await secretsService.get(organizationId, `${prefix}_EMAIL`);
        const twoFactorSecret = await secretsService.get(organizationId, `${prefix}_2FA_SECRET`);
        if (!username || !password) return null;
        return { platform, username, password, email: email ?? undefined, twoFactorSecret: twoFactorSecret ?? undefined };
      }

      case "bluesky": {
        const handle = await secretsService.get(organizationId, `${prefix}_HANDLE`);
        const appPassword = await secretsService.get(organizationId, `${prefix}_APP_PASSWORD`);
        if (!handle || !appPassword) return null;
        return { platform, handle, appPassword };
      }

      case "discord": {
        const botToken = await secretsService.get(organizationId, `${prefix}_BOT_TOKEN`);
        const webhookUrl = await secretsService.get(organizationId, `${prefix}_WEBHOOK_URL`);
        if (!botToken && !webhookUrl) return null;
        return { platform, botToken: botToken ?? undefined, webhookUrl: webhookUrl ?? undefined };
      }

      case "telegram": {
        const botToken = await secretsService.get(organizationId, `${prefix}_BOT_TOKEN`);
        if (!botToken) return null;
        return { platform, botToken };
      }

      case "reddit": {
        const apiKey = await secretsService.get(organizationId, `${prefix}_CLIENT_ID`);
        const apiSecret = await secretsService.get(organizationId, `${prefix}_CLIENT_SECRET`);
        const username = await secretsService.get(organizationId, `${prefix}_USERNAME`);
        const password = await secretsService.get(organizationId, `${prefix}_PASSWORD`);
        if (!apiKey || !apiSecret || !username || !password) return null;
        return { platform, apiKey, apiSecret, username, password };
      }

      case "tiktok": {
        const accessToken = await secretsService.get(organizationId, `${prefix}_ACCESS_TOKEN`);
        if (!accessToken) return null;
        return { platform, accessToken };
      }

      case "linkedin": {
        const accessToken = await secretsService.get(organizationId, `${prefix}_ACCESS_TOKEN`);
        if (!accessToken) return null;
        return { platform, accessToken };
      }

      case "facebook":
      case "instagram": {
        const accessToken = await secretsService.get(organizationId, `META_ACCESS_TOKEN`);
        const pageId = await secretsService.get(organizationId, `META_PAGE_ID`);
        const accountId = await secretsService.get(organizationId, `META_IG_ACCOUNT_ID`);
        if (!accessToken) return null;
        return { platform, accessToken, pageId: pageId ?? undefined, accountId: accountId ?? undefined };
      }

      default:
        return null;
    }
  }

  /**
   * Create a post to one or more platforms
   */
  async createPost(input: CreatePostInput): Promise<MultiPlatformPostResult> {
    const {
      organizationId,
      userId,
      content,
      platforms,
      platformOptions,
      credentialIds,
      scheduledAt,
    } = input;

    logger.info("[SocialMedia] Creating post", {
      organizationId,
      platforms,
      hasMedia: !!content.media?.length,
      scheduledAt,
    });

    // Calculate total cost
    const totalCost = platforms.length * POST_CREDIT_COST;

    // Deduct credits
    const deduction = await creditsService.deductCredits({
      organizationId,
      amount: totalCost,
      description: `Social media post to ${platforms.join(", ")}`,
      metadata: { userId, platforms },
    });

    if (!deduction.success) {
      throw new Error(`Insufficient credits: need $${totalCost.toFixed(4)}`);
    }

    // Post to each platform in parallel
    const results = await Promise.all(
      platforms.map(async (platform): Promise<PostResult> => {
        const provider = providers[platform];
        if (!provider) {
          return {
            platform,
            success: false,
            error: `Platform ${platform} is not supported`,
          };
        }

        const credentials = await this.getCredentialsForPlatform(
          organizationId,
          platform,
          credentialIds?.[platform]
        );

        if (!credentials) {
          return {
            platform,
            success: false,
            error: `No credentials found for ${platform}`,
          };
        }

        try {
          const result = await provider.createPost(
            credentials,
            content,
            platformOptions
          );
          return result;
        } catch (error) {
          logger.error("[SocialMedia] Post failed", {
            platform,
            error: error instanceof Error ? error.message : "Unknown error",
          });
          return {
            platform,
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      })
    );

    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    // Refund credits for failed posts
    if (failed.length > 0) {
      const refundAmount = failed.length * POST_CREDIT_COST;
      await creditsService.refundCredits({
        organizationId,
        amount: refundAmount,
        description: `Refund for failed posts: ${failed.map((f) => f.platform).join(", ")}`,
        metadata: { userId, failedPlatforms: failed.map((f) => f.platform) },
      });
    }

    logger.info("[SocialMedia] Post complete", {
      organizationId,
      successCount: successful.length,
      failureCount: failed.length,
    });

    return {
      results,
      successful,
      failed,
      totalPlatforms: platforms.length,
      successCount: successful.length,
      failureCount: failed.length,
    };
  }

  /**
   * Delete a post from a platform
   */
  async deletePost(
    organizationId: string,
    platform: SocialPlatform,
    postId: string,
    credentialId?: string
  ): Promise<{ success: boolean; error?: string }> {
    const provider = this.getProvider(platform);

    if (!provider.deletePost) {
      return { success: false, error: `Delete not supported for ${platform}` };
    }

    const credentials = await this.getCredentialsForPlatform(
      organizationId,
      platform,
      credentialId
    );

    if (!credentials) {
      return { success: false, error: `No credentials found for ${platform}` };
    }

    return provider.deletePost(credentials, postId);
  }

  /**
   * Get analytics for a specific post
   */
  async getPostAnalytics(input: GetAnalyticsInput): Promise<PostAnalytics | null> {
    const { organizationId, platform, postId, credentialId } = input;

    if (!postId) {
      throw new Error("postId is required for post analytics");
    }

    const provider = this.getProvider(platform);

    if (!provider.getPostAnalytics) {
      return null;
    }

    const credentials = await this.getCredentialsForPlatform(
      organizationId,
      platform,
      credentialId
    );

    if (!credentials) {
      throw new Error(`No credentials found for ${platform}`);
    }

    return provider.getPostAnalytics(credentials, postId);
  }

  /**
   * Get account-level analytics
   */
  async getAccountAnalytics(
    input: Omit<GetAnalyticsInput, "postId">
  ): Promise<AccountAnalytics | null> {
    const { organizationId, platform, credentialId } = input;

    const provider = this.getProvider(platform);

    if (!provider.getAccountAnalytics) {
      return null;
    }

    const credentials = await this.getCredentialsForPlatform(
      organizationId,
      platform,
      credentialId
    );

    if (!credentials) {
      throw new Error(`No credentials found for ${platform}`);
    }

    return provider.getAccountAnalytics(credentials);
  }

  /**
   * Upload media to a platform
   */
  async uploadMedia(
    organizationId: string,
    platform: SocialPlatform,
    media: MediaAttachment,
    credentialId?: string
  ): Promise<{ mediaId: string; url?: string }> {
    const provider = this.getProvider(platform);

    if (!provider.uploadMedia) {
      throw new Error(`Media upload not supported for ${platform}`);
    }

    const credentials = await this.getCredentialsForPlatform(
      organizationId,
      platform,
      credentialId
    );

    if (!credentials) {
      throw new Error(`No credentials found for ${platform}`);
    }

    return provider.uploadMedia(credentials, media);
  }

  /**
   * Reply to a post on a platform
   */
  async replyToPost(
    organizationId: string,
    platform: SocialPlatform,
    postId: string,
    content: PostContent,
    options?: PlatformPostOptions,
    credentialId?: string
  ): Promise<PostResult> {
    const provider = this.getProvider(platform);

    if (!provider.replyToPost) {
      return {
        platform,
        success: false,
        error: `Reply not supported for ${platform}`,
      };
    }

    const credentials = await this.getCredentialsForPlatform(
      organizationId,
      platform,
      credentialId
    );

    if (!credentials) {
      return {
        platform,
        success: false,
        error: `No credentials found for ${platform}`,
      };
    }

    // Deduct credits for reply
    const deduction = await creditsService.deductCredits({
      organizationId,
      amount: POST_CREDIT_COST,
      description: `Social media reply on ${platform}`,
      metadata: { platform, postId },
    });

    if (!deduction.success) {
      return {
        platform,
        success: false,
        error: "Insufficient credits",
      };
    }

    const result = await provider.replyToPost(credentials, postId, content, options);

    if (!result.success) {
      await creditsService.refundCredits({
        organizationId,
        amount: POST_CREDIT_COST,
        description: `Refund for failed reply on ${platform}`,
        metadata: { platform, postId },
      });
    }

    return result;
  }

  /**
   * Like a post on a platform
   */
  async likePost(
    organizationId: string,
    platform: SocialPlatform,
    postId: string,
    credentialId?: string
  ): Promise<{ success: boolean; error?: string }> {
    const provider = this.getProvider(platform);

    if (!provider.likePost) {
      return { success: false, error: `Like not supported for ${platform}` };
    }

    const credentials = await this.getCredentialsForPlatform(
      organizationId,
      platform,
      credentialId
    );

    if (!credentials) {
      return { success: false, error: `No credentials found for ${platform}` };
    }

    return provider.likePost(credentials, postId);
  }

  /**
   * Repost/retweet/share on a platform
   */
  async repost(
    organizationId: string,
    platform: SocialPlatform,
    postId: string,
    credentialId?: string
  ): Promise<PostResult> {
    const provider = this.getProvider(platform);

    if (!provider.repost) {
      return {
        platform,
        success: false,
        error: `Repost not supported for ${platform}`,
      };
    }

    const credentials = await this.getCredentialsForPlatform(
      organizationId,
      platform,
      credentialId
    );

    if (!credentials) {
      return {
        platform,
        success: false,
        error: `No credentials found for ${platform}`,
      };
    }

    return provider.repost(credentials, postId);
  }

  /**
   * Validate credentials for a platform
   */
  async validateCredentials(
    organizationId: string,
    platform: SocialPlatform,
    credentialId?: string
  ): Promise<{
    valid: boolean;
    accountId?: string;
    username?: string;
    displayName?: string;
    avatarUrl?: string;
    error?: string;
  }> {
    const provider = this.getProvider(platform);

    const credentials = await this.getCredentialsForPlatform(
      organizationId,
      platform,
      credentialId
    );

    if (!credentials) {
      return { valid: false, error: `No credentials found for ${platform}` };
    }

    return provider.validateCredentials(credentials);
  }

  /**
   * Store credentials for a platform
   */
  async storeCredentials(
    organizationId: string,
    userId: string,
    platform: SocialPlatform,
    credentials: Partial<SocialCredentials>
  ): Promise<void> {
    const prefix = platform.toUpperCase();

    const audit = {
      actorType: "user" as const,
      actorId: userId,
      source: "social-media-service",
    };

    // Store each credential field as a secret
    if (credentials.accessToken) {
      await secretsService.create({
        organizationId,
        name: `${prefix}_ACCESS_TOKEN`,
        value: credentials.accessToken,
        scope: "organization",
        createdBy: userId,
      }, audit);
    }

    if (credentials.refreshToken) {
      await secretsService.create({
        organizationId,
        name: `${prefix}_REFRESH_TOKEN`,
        value: credentials.refreshToken,
        scope: "organization",
        createdBy: userId,
      }, audit);
    }

    if (credentials.botToken) {
      await secretsService.create({
        organizationId,
        name: `${prefix}_BOT_TOKEN`,
        value: credentials.botToken,
        scope: "organization",
        createdBy: userId,
      }, audit);
    }

    if (credentials.apiKey) {
      await secretsService.create({
        organizationId,
        name: `${prefix}_CLIENT_ID`,
        value: credentials.apiKey,
        scope: "organization",
        createdBy: userId,
      }, audit);
    }

    if (credentials.apiSecret) {
      await secretsService.create({
        organizationId,
        name: `${prefix}_CLIENT_SECRET`,
        value: credentials.apiSecret,
        scope: "organization",
        createdBy: userId,
      }, audit);
    }

    if (credentials.username) {
      await secretsService.create({
        organizationId,
        name: `${prefix}_USERNAME`,
        value: credentials.username,
        scope: "organization",
        createdBy: userId,
      }, audit);
    }

    if (credentials.password) {
      await secretsService.create({
        organizationId,
        name: `${prefix}_PASSWORD`,
        value: credentials.password,
        scope: "organization",
        createdBy: userId,
      }, audit);
    }

    if (credentials.email) {
      await secretsService.create({
        organizationId,
        name: `${prefix}_EMAIL`,
        value: credentials.email,
        scope: "organization",
        createdBy: userId,
      }, audit);
    }

    if (credentials.handle) {
      await secretsService.create({
        organizationId,
        name: `${prefix}_HANDLE`,
        value: credentials.handle,
        scope: "organization",
        createdBy: userId,
      }, audit);
    }

    if (credentials.appPassword) {
      await secretsService.create({
        organizationId,
        name: `${prefix}_APP_PASSWORD`,
        value: credentials.appPassword,
        scope: "organization",
        createdBy: userId,
      }, audit);
    }

    if (credentials.webhookUrl) {
      await secretsService.create({
        organizationId,
        name: `${prefix}_WEBHOOK_URL`,
        value: credentials.webhookUrl,
        scope: "organization",
        createdBy: userId,
      }, audit);
    }

    logger.info("[SocialMedia] Credentials stored", { organizationId, platform });
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const socialMediaService = new SocialMediaService();
export * from "@/lib/types/social-media";

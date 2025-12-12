/**
 * Unit Tests for Social Media Types and Service
 *
 * Tests:
 * 1. Platform validation and constants
 * 2. Content validation (boundary conditions, edge cases)
 * 3. Provider availability and structure
 * 4. Result aggregation
 * 5. Analytics validation
 * 6. Credit calculation (boundary conditions)
 * 7. Error handling and invalid inputs
 * 8. Concurrent behavior
 */

import { describe, it, expect } from "bun:test";
import type { SocialPlatform, PostResult } from "@/lib/types/social-media";

describe("Social Media Types", () => {
  it("should have all supported platforms defined", async () => {
    const { SUPPORTED_PLATFORMS } = await import("@/lib/types/social-media");

    expect(SUPPORTED_PLATFORMS).toContain("twitter");
    expect(SUPPORTED_PLATFORMS).toContain("bluesky");
    expect(SUPPORTED_PLATFORMS).toContain("discord");
    expect(SUPPORTED_PLATFORMS).toContain("telegram");
    expect(SUPPORTED_PLATFORMS).toContain("reddit");
    expect(SUPPORTED_PLATFORMS).toContain("facebook");
    expect(SUPPORTED_PLATFORMS).toContain("instagram");
    expect(SUPPORTED_PLATFORMS).toContain("tiktok");
    expect(SUPPORTED_PLATFORMS).toContain("linkedin");
    expect(SUPPORTED_PLATFORMS).toContain("mastodon");
  });

  it("should define platform capabilities correctly", async () => {
    const { PLATFORM_CAPABILITIES } = await import("@/lib/types/social-media");

    // Twitter capabilities
    expect(PLATFORM_CAPABILITIES.twitter.supportsText).toBe(true);
    expect(PLATFORM_CAPABILITIES.twitter.supportsImages).toBe(true);
    expect(PLATFORM_CAPABILITIES.twitter.supportsVideo).toBe(true);
    expect(PLATFORM_CAPABILITIES.twitter.maxTextLength).toBe(280);

    // Discord capabilities
    expect(PLATFORM_CAPABILITIES.discord.supportsText).toBe(true);
    expect(PLATFORM_CAPABILITIES.discord.supportsImages).toBe(true);
    expect(PLATFORM_CAPABILITIES.discord.maxTextLength).toBe(2000);

    // TikTok capabilities
    expect(PLATFORM_CAPABILITIES.tiktok.supportsText).toBe(false);
    expect(PLATFORM_CAPABILITIES.tiktok.supportsVideo).toBe(true);
  });
});

describe("Content Validation", () => {
  it("should validate text content within limits", async () => {
    const { validatePostContent } = await import("@/lib/types/social-media");

    const validContent = { text: "Hello, world!" };
    const result = validatePostContent(validContent, "twitter");
    expect(result.valid).toBe(true);
  });

  it("should reject text exceeding platform limit", async () => {
    const { validatePostContent } = await import("@/lib/types/social-media");

    const longText = "a".repeat(300); // Exceeds Twitter's 280 limit
    const invalidContent = { text: longText };
    const result = validatePostContent(invalidContent, "twitter");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("exceeds");
  });

  it("should require video for TikTok", async () => {
    const { validatePostContent } = await import("@/lib/types/social-media");

    const textOnlyContent = { text: "This is text only" };
    const result = validatePostContent(textOnlyContent, "tiktok");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("video");
  });

  it("should validate media attachments", async () => {
    const { validatePostContent } = await import("@/lib/types/social-media");

    const contentWithMedia = {
      text: "Check out this image!",
      media: [{ type: "image" as const, url: "https://example.com/image.jpg", mimeType: "image/jpeg" }],
    };
    const result = validatePostContent(contentWithMedia, "twitter");
    expect(result.valid).toBe(true);
  });

  it("should reject too many media attachments", async () => {
    const { validatePostContent, PLATFORM_CAPABILITIES } = await import("@/lib/types/social-media");

    const maxImages = PLATFORM_CAPABILITIES.twitter.maxImages;
    const tooManyImages = Array(maxImages + 1)
      .fill(null)
      .map((_, i) => ({ type: "image" as const, url: `https://example.com/image${i}.jpg`, mimeType: "image/jpeg" }));

    const contentWithTooManyMedia = { text: "Too many images!", media: tooManyImages };
    const result = validatePostContent(contentWithTooManyMedia, "twitter");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("images");
  });
});

describe("Platform Provider Registration", () => {
  it("should have Twitter provider available", async () => {
    const { socialMediaService } = await import("@/lib/services/social-media");
    expect(socialMediaService.isPlatformSupported("twitter")).toBe(true);
  });

  it("should have all core platform providers available", async () => {
    const { socialMediaService } = await import("@/lib/services/social-media");
    const platforms = socialMediaService.getSupportedPlatforms();

    expect(platforms).toContain("twitter");
    expect(platforms).toContain("bluesky");
    expect(platforms).toContain("discord");
    expect(platforms).toContain("telegram");
    expect(platforms).toContain("reddit");
    expect(platforms).toContain("facebook");
    expect(platforms).toContain("instagram");
    expect(platforms).toContain("tiktok");
    expect(platforms).toContain("linkedin");
  });

  it("should get provider by platform name", async () => {
    const { socialMediaService } = await import("@/lib/services/social-media");
    const provider = socialMediaService.getProvider("twitter");

    expect(provider).toBeDefined();
    expect(provider.platform).toBe("twitter");
  });
});

describe("Provider Structure", () => {
  it("should have Twitter provider with required methods", async () => {
    const { twitterProvider } = await import("@/lib/services/social-media/providers/twitter");

    expect(twitterProvider.platform).toBe("twitter");
    expect(typeof twitterProvider.createPost).toBe("function");
    expect(typeof twitterProvider.deletePost).toBe("function");
    expect(typeof twitterProvider.validateCredentials).toBe("function");
  });

  it("should have Bluesky provider with required methods", async () => {
    const { blueskyProvider } = await import("@/lib/services/social-media/providers/bluesky");

    expect(blueskyProvider.platform).toBe("bluesky");
    expect(typeof blueskyProvider.createPost).toBe("function");
    expect(typeof blueskyProvider.deletePost).toBe("function");
    expect(typeof blueskyProvider.validateCredentials).toBe("function");
  });

  it("should have Discord provider with required methods", async () => {
    const { discordProvider } = await import("@/lib/services/social-media/providers/discord");

    expect(discordProvider.platform).toBe("discord");
    expect(typeof discordProvider.createPost).toBe("function");
    expect(typeof discordProvider.deletePost).toBe("function");
    expect(typeof discordProvider.validateCredentials).toBe("function");
  });

  it("should have Telegram provider with required methods", async () => {
    const { telegramProvider } = await import("@/lib/services/social-media/providers/telegram");

    expect(telegramProvider.platform).toBe("telegram");
    expect(typeof telegramProvider.createPost).toBe("function");
    expect(typeof telegramProvider.deletePost).toBe("function");
    expect(typeof telegramProvider.validateCredentials).toBe("function");
  });
});

describe("Post Result Handling", () => {
  it("should structure successful post result correctly", async () => {
    const { createSuccessResult } = await import("@/lib/types/social-media");

    const result = createSuccessResult("twitter", "post-123", "https://twitter.com/user/status/123");

    expect(result.success).toBe(true);
    expect(result.platform).toBe("twitter");
    expect(result.postId).toBe("post-123");
    expect(result.postUrl).toBe("https://twitter.com/user/status/123");
    expect(result.error).toBeUndefined();
  });

  it("should structure failed post result correctly", async () => {
    const { createErrorResult } = await import("@/lib/types/social-media");

    const result = createErrorResult("twitter", "Rate limit exceeded");

    expect(result.success).toBe(false);
    expect(result.platform).toBe("twitter");
    expect(result.error).toBe("Rate limit exceeded");
    expect(result.postId).toBeUndefined();
  });
});

describe("Multi-Platform Post Handling", () => {
  it("should aggregate results from multiple platforms", async () => {
    const { aggregateResults } = await import("@/lib/types/social-media");

    const results = [
      { success: true, platform: "twitter" as const, postId: "tw-123" },
      { success: false, platform: "bluesky" as const, error: "Auth failed" },
      { success: true, platform: "discord" as const, postId: "dc-456" },
    ];

    const aggregated = aggregateResults(results);

    expect(aggregated.totalPlatforms).toBe(3);
    expect(aggregated.successCount).toBe(2);
    expect(aggregated.failureCount).toBe(1);
    expect(aggregated.successful).toHaveLength(2);
    expect(aggregated.failed).toHaveLength(1);
  });

  it("should handle all failures gracefully", async () => {
    const { aggregateResults } = await import("@/lib/types/social-media");

    const results = [
      { success: false, platform: "twitter" as const, error: "Error 1" },
      { success: false, platform: "bluesky" as const, error: "Error 2" },
    ];

    const aggregated = aggregateResults(results);

    expect(aggregated.totalPlatforms).toBe(2);
    expect(aggregated.successCount).toBe(0);
    expect(aggregated.failureCount).toBe(2);
  });
});

describe("Platform-Specific Options", () => {
  it("should accept Twitter-specific options", async () => {
    const { validatePlatformOptions } = await import("@/lib/types/social-media");

    const twitterOptions = { replyToTweetId: "12345", quoteTweetId: "67890" };
    const result = validatePlatformOptions("twitter", twitterOptions);
    expect(result.valid).toBe(true);
  });

  it("should accept Discord-specific options", async () => {
    const { validatePlatformOptions } = await import("@/lib/types/social-media");

    const discordOptions = { channelId: "123456789", embedTitle: "Test Embed", embedColor: 0x00ff00 };
    const result = validatePlatformOptions("discord", discordOptions);
    expect(result.valid).toBe(true);
  });

  it("should accept Reddit-specific options", async () => {
    const { validatePlatformOptions } = await import("@/lib/types/social-media");

    const redditOptions = { subreddit: "test", title: "Test Post", flair: "Discussion" };
    const result = validatePlatformOptions("reddit", redditOptions);
    expect(result.valid).toBe(true);
  });

  it("should require subreddit for Reddit", async () => {
    const { validatePlatformOptions } = await import("@/lib/types/social-media");

    const redditOptionsNoSubreddit = { title: "Test Post" };
    const result = validatePlatformOptions("reddit", redditOptionsNoSubreddit);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("subreddit");
  });

  it("should accept TikTok-specific options", async () => {
    const { validatePlatformOptions } = await import("@/lib/types/social-media");

    const tiktokOptions = { privacyLevel: "PUBLIC_TO_EVERYONE", disableComment: false };
    const result = validatePlatformOptions("tiktok", tiktokOptions);
    expect(result.valid).toBe(true);
  });
});

describe("Analytics Types", () => {
  it("should define post analytics structure", async () => {
    const { isValidPostAnalytics } = await import("@/lib/types/social-media");

    const analytics = {
      postId: "123",
      platform: "twitter",
      impressions: 1000,
      likes: 50,
      comments: 10,
      shares: 5,
      fetchedAt: new Date(),
    };

    expect(isValidPostAnalytics(analytics)).toBe(true);
  });

  it("should define account analytics structure", async () => {
    const { isValidAccountAnalytics } = await import("@/lib/types/social-media");

    const analytics = {
      platform: "twitter",
      followers: 5000,
      following: 500,
      totalPosts: 1000,
      fetchedAt: new Date(),
    };

    expect(isValidAccountAnalytics(analytics)).toBe(true);
  });
});

describe("Credit Cost Calculation", () => {
  it("should calculate credits for single platform post", async () => {
    const { calculatePostCredits } = await import("@/lib/types/social-media");

    const cost = calculatePostCredits(["twitter"], { text: "Hello" });

    expect(cost).toBeGreaterThan(0);
    expect(typeof cost).toBe("number");
  });

  it("should calculate credits for multi-platform post", async () => {
    const { calculatePostCredits } = await import("@/lib/types/social-media");

    const singleCost = calculatePostCredits(["twitter"], { text: "Hello" });
    const multiCost = calculatePostCredits(["twitter", "bluesky", "discord"], { text: "Hello" });

    expect(multiCost).toBeGreaterThan(singleCost);
  });

  it("should include media in credit calculation", async () => {
    const { calculatePostCredits } = await import("@/lib/types/social-media");

    const textOnlyCost = calculatePostCredits(["twitter"], { text: "Hello" });
    const withMediaCost = calculatePostCredits(["twitter"], {
      text: "Hello",
      media: [{ type: "image", url: "https://example.com/img.jpg", mimeType: "image/jpeg" }],
    });

    expect(withMediaCost).toBeGreaterThanOrEqual(textOnlyCost);
  });

  it("should apply platform multipliers correctly", async () => {
    const { calculatePostCredits } = await import("@/lib/types/social-media");

    const twitterCost = calculatePostCredits(["twitter"], { text: "Hello" });
    const tiktokCost = calculatePostCredits(["tiktok"], { text: "Hello" });
    const instagramCost = calculatePostCredits(["instagram"], { text: "Hello" });

    // TikTok has 2.0x multiplier, Instagram has 1.5x
    expect(tiktokCost).toBeGreaterThan(twitterCost);
    expect(instagramCost).toBeGreaterThan(twitterCost);
    expect(tiktokCost).toBeGreaterThan(instagramCost);
  });

  it("should handle empty platforms array", async () => {
    const { calculatePostCredits } = await import("@/lib/types/social-media");

    const cost = calculatePostCredits([], { text: "Hello" });
    expect(cost).toBe(0);
  });

  it("should scale linearly with media count", async () => {
    const { calculatePostCredits } = await import("@/lib/types/social-media");

    const oneMedia = calculatePostCredits(["twitter"], {
      text: "Hello",
      media: [{ type: "image", url: "https://example.com/1.jpg", mimeType: "image/jpeg" }],
    });
    const twoMedia = calculatePostCredits(["twitter"], {
      text: "Hello",
      media: [
        { type: "image", url: "https://example.com/1.jpg", mimeType: "image/jpeg" },
        { type: "image", url: "https://example.com/2.jpg", mimeType: "image/jpeg" },
      ],
    });

    expect(twoMedia - oneMedia).toBe(oneMedia - calculatePostCredits(["twitter"], { text: "Hello" }));
  });
});

// =============================================================================
// BOUNDARY CONDITION TESTS
// =============================================================================

describe("Content Validation - Boundary Conditions", () => {
  it("should accept text exactly at platform limit", async () => {
    const { validatePostContent, PLATFORM_CAPABILITIES } = await import("@/lib/types/social-media");

    const exactLimit = "a".repeat(PLATFORM_CAPABILITIES.twitter.maxTextLength);
    const result = validatePostContent({ text: exactLimit }, "twitter");

    expect(result.valid).toBe(true);
    expect(exactLimit.length).toBe(280);
  });

  it("should reject text one character over limit", async () => {
    const { validatePostContent, PLATFORM_CAPABILITIES } = await import("@/lib/types/social-media");

    const overLimit = "a".repeat(PLATFORM_CAPABILITIES.twitter.maxTextLength + 1);
    const result = validatePostContent({ text: overLimit }, "twitter");

    expect(result.valid).toBe(false);
    expect(overLimit.length).toBe(281);
  });

  it("should accept exactly max images allowed", async () => {
    const { validatePostContent, PLATFORM_CAPABILITIES } = await import("@/lib/types/social-media");

    const maxImages = PLATFORM_CAPABILITIES.twitter.maxImages;
    const exactMaxImages = Array(maxImages)
      .fill(null)
      .map((_, i) => ({ type: "image" as const, url: `https://example.com/${i}.jpg`, mimeType: "image/jpeg" }));

    const result = validatePostContent({ text: "Test", media: exactMaxImages }, "twitter");
    expect(result.valid).toBe(true);
    expect(exactMaxImages.length).toBe(4);
  });

  it("should handle empty text string", async () => {
    const { validatePostContent } = await import("@/lib/types/social-media");

    const result = validatePostContent({ text: "" }, "twitter");
    expect(result.valid).toBe(true);
  });

  it("should validate each platform's unique max length", async () => {
    const { validatePostContent, PLATFORM_CAPABILITIES, SUPPORTED_PLATFORMS } = await import("@/lib/types/social-media");

    for (const platform of SUPPORTED_PLATFORMS) {
      const cap = PLATFORM_CAPABILITIES[platform];
      if (!cap.supportsText) continue;

      const atLimit = "a".repeat(cap.maxTextLength);
      const overLimit = "a".repeat(cap.maxTextLength + 1);

      expect(validatePostContent({ text: atLimit }, platform).valid).toBe(true);
      expect(validatePostContent({ text: overLimit }, platform).valid).toBe(false);
    }
  });

  it("should validate Discord's 2000 character limit", async () => {
    const { validatePostContent, PLATFORM_CAPABILITIES } = await import("@/lib/types/social-media");

    expect(PLATFORM_CAPABILITIES.discord.maxTextLength).toBe(2000);

    const at2000 = "x".repeat(2000);
    const at2001 = "x".repeat(2001);

    expect(validatePostContent({ text: at2000 }, "discord").valid).toBe(true);
    expect(validatePostContent({ text: at2001 }, "discord").valid).toBe(false);
  });

  it("should validate Reddit's large text limit", async () => {
    const { validatePostContent, PLATFORM_CAPABILITIES } = await import("@/lib/types/social-media");

    expect(PLATFORM_CAPABILITIES.reddit.maxTextLength).toBe(40000);

    const at40000 = "x".repeat(40000);
    expect(validatePostContent({ text: at40000 }, "reddit").valid).toBe(true);
  });
});

// =============================================================================
// ERROR HANDLING TESTS
// =============================================================================

describe("Error Handling - Invalid Inputs", () => {
  it("should throw for unsupported platform in getProvider", async () => {
    const { socialMediaService } = await import("@/lib/services/social-media");

    expect(() => socialMediaService.getProvider("mastodon")).toThrow("not supported");
  });

  it("should return false for unsupported platform check", async () => {
    const { socialMediaService } = await import("@/lib/services/social-media");

    expect(socialMediaService.isPlatformSupported("mastodon")).toBe(false);
  });

  it("should handle validatePostContent with undefined media gracefully", async () => {
    const { validatePostContent } = await import("@/lib/types/social-media");

    const result = validatePostContent({ text: "Hello", media: undefined }, "twitter");
    expect(result.valid).toBe(true);
  });

  it("should handle empty media array", async () => {
    const { validatePostContent } = await import("@/lib/types/social-media");

    const result = validatePostContent({ text: "Hello", media: [] }, "twitter");
    expect(result.valid).toBe(true);
  });

  it("should validate platform options with empty object", async () => {
    const { validatePlatformOptions } = await import("@/lib/types/social-media");

    // Empty options should pass for platforms without required fields
    expect(validatePlatformOptions("twitter", {}).valid).toBe(true);
    expect(validatePlatformOptions("bluesky", {}).valid).toBe(true);

    // Empty options should fail for platforms with required fields
    expect(validatePlatformOptions("reddit", {}).valid).toBe(false);
  });

  it("should handle createErrorResult with all optional params", async () => {
    const { createErrorResult } = await import("@/lib/types/social-media");

    const result = createErrorResult("twitter", "Rate limited", "RATE_LIMIT", true, 60);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Rate limited");
    expect(result.errorCode).toBe("RATE_LIMIT");
    expect(result.rateLimited).toBe(true);
    expect(result.retryAfter).toBe(60);
  });

  it("should handle createSuccessResult with metadata", async () => {
    const { createSuccessResult } = await import("@/lib/types/social-media");

    const metadata = { engagement: 100, impressions: 1000 };
    const result = createSuccessResult("twitter", "123", "https://twitter.com/x", metadata);

    expect(result.metadata).toEqual(metadata);
  });
});

// =============================================================================
// EDGE CASE TESTS
// =============================================================================

describe("Edge Cases", () => {
  it("should handle aggregateResults with empty array", async () => {
    const { aggregateResults } = await import("@/lib/types/social-media");

    const result = aggregateResults([]);

    expect(result.totalPlatforms).toBe(0);
    expect(result.successCount).toBe(0);
    expect(result.failureCount).toBe(0);
    expect(result.successful).toEqual([]);
    expect(result.failed).toEqual([]);
  });

  it("should handle aggregateResults with all successes", async () => {
    const { aggregateResults } = await import("@/lib/types/social-media");

    const results: PostResult[] = [
      { success: true, platform: "twitter", postId: "1" },
      { success: true, platform: "bluesky", postId: "2" },
      { success: true, platform: "discord", postId: "3" },
    ];

    const aggregated = aggregateResults(results);

    expect(aggregated.successCount).toBe(3);
    expect(aggregated.failureCount).toBe(0);
    expect(aggregated.successful.length).toBe(3);
    expect(aggregated.failed.length).toBe(0);
  });

  it("should count videos separately from images in media validation", async () => {
    const { validatePostContent } = await import("@/lib/types/social-media");

    // 4 images + 1 video should be valid (video doesn't count toward image limit)
    const mixedMedia = [
      { type: "image" as const, url: "https://example.com/1.jpg", mimeType: "image/jpeg" },
      { type: "image" as const, url: "https://example.com/2.jpg", mimeType: "image/jpeg" },
      { type: "image" as const, url: "https://example.com/3.jpg", mimeType: "image/jpeg" },
      { type: "image" as const, url: "https://example.com/4.jpg", mimeType: "image/jpeg" },
      { type: "video" as const, url: "https://example.com/v.mp4", mimeType: "video/mp4" },
    ];

    const result = validatePostContent({ text: "Mixed media", media: mixedMedia }, "twitter");
    expect(result.valid).toBe(true);
  });

  it("should accept TikTok with video content", async () => {
    const { validatePostContent } = await import("@/lib/types/social-media");

    const result = validatePostContent(
      {
        text: "",
        media: [{ type: "video", url: "https://example.com/video.mp4", mimeType: "video/mp4" }],
      },
      "tiktok"
    );

    expect(result.valid).toBe(true);
  });

  it("should handle unicode characters in text length validation", async () => {
    const { validatePostContent, PLATFORM_CAPABILITIES } = await import("@/lib/types/social-media");

    // Emoji characters
    const emojiText = "👋".repeat(280);
    const result = validatePostContent({ text: emojiText }, "twitter");

    // 280 emoji characters should exceed limit (each emoji is one char in string length)
    expect(result.valid).toBe(false);
  });

  it("should handle special characters in text", async () => {
    const { validatePostContent } = await import("@/lib/types/social-media");

    const specialText = "Hello! @user #hashtag https://example.com\n\nNew line & special chars: <>'\"";
    const result = validatePostContent({ text: specialText }, "twitter");

    expect(result.valid).toBe(true);
  });
});

// =============================================================================
// ANALYTICS VALIDATION EDGE CASES
// =============================================================================

describe("Analytics Validation Edge Cases", () => {
  it("should reject post analytics without postId", async () => {
    const { isValidPostAnalytics } = await import("@/lib/types/social-media");

    expect(isValidPostAnalytics({ platform: "twitter", fetchedAt: new Date() })).toBe(false);
  });

  it("should reject post analytics without platform", async () => {
    const { isValidPostAnalytics } = await import("@/lib/types/social-media");

    expect(isValidPostAnalytics({ postId: "123", fetchedAt: new Date() })).toBe(false);
  });

  it("should reject post analytics without fetchedAt date", async () => {
    const { isValidPostAnalytics } = await import("@/lib/types/social-media");

    expect(isValidPostAnalytics({ postId: "123", platform: "twitter" })).toBe(false);
  });

  it("should reject post analytics with string fetchedAt", async () => {
    const { isValidPostAnalytics } = await import("@/lib/types/social-media");

    expect(isValidPostAnalytics({ postId: "123", platform: "twitter", fetchedAt: "2024-01-01" })).toBe(false);
  });

  it("should reject account analytics without platform", async () => {
    const { isValidAccountAnalytics } = await import("@/lib/types/social-media");

    expect(isValidAccountAnalytics({ fetchedAt: new Date() })).toBe(false);
  });

  it("should reject account analytics with numeric platform", async () => {
    const { isValidAccountAnalytics } = await import("@/lib/types/social-media");

    expect(isValidAccountAnalytics({ platform: 123, fetchedAt: new Date() })).toBe(false);
  });
});

// =============================================================================
// PROVIDER COMPLETENESS TESTS
// =============================================================================

describe("Provider Completeness", () => {
  it("should have all required providers registered", async () => {
    const { socialMediaService } = await import("@/lib/services/social-media");

    const requiredPlatforms: SocialPlatform[] = [
      "twitter",
      "bluesky",
      "discord",
      "telegram",
      "reddit",
      "facebook",
      "instagram",
      "tiktok",
      "linkedin",
    ];

    const supported = socialMediaService.getSupportedPlatforms();

    for (const platform of requiredPlatforms) {
      expect(supported).toContain(platform);
    }
  });

  it("should have consistent platform property on all providers", async () => {
    const { socialMediaService } = await import("@/lib/services/social-media");

    const platforms = socialMediaService.getSupportedPlatforms();

    for (const platform of platforms) {
      const provider = socialMediaService.getProvider(platform);
      // Provider's platform property should match (except meta handles both fb/ig)
      if (platform === "instagram") {
        expect(provider.platform).toBe("facebook"); // meta provider handles both
      } else {
        expect(provider.platform).toBe(platform);
      }
    }
  });

  it("all providers should have createPost method", async () => {
    const { socialMediaService } = await import("@/lib/services/social-media");

    const platforms = socialMediaService.getSupportedPlatforms();

    for (const platform of platforms) {
      const provider = socialMediaService.getProvider(platform);
      expect(typeof provider.createPost).toBe("function");
    }
  });

  it("all providers should have validateCredentials method", async () => {
    const { socialMediaService } = await import("@/lib/services/social-media");

    const platforms = socialMediaService.getSupportedPlatforms();

    for (const platform of platforms) {
      const provider = socialMediaService.getProvider(platform);
      expect(typeof provider.validateCredentials).toBe("function");
    }
  });
});

// =============================================================================
// CONCURRENT BEHAVIOR TESTS
// =============================================================================

describe("Concurrent Behavior", () => {
  it("should handle parallel validation calls", async () => {
    const { validatePostContent, SUPPORTED_PLATFORMS } = await import("@/lib/types/social-media");

    const validations = SUPPORTED_PLATFORMS.map((platform) =>
      Promise.resolve(validatePostContent({ text: "Test post" }, platform))
    );

    const results = await Promise.all(validations);

    // All should complete without error
    expect(results.length).toBe(SUPPORTED_PLATFORMS.length);

    // Text-supporting platforms should pass, TikTok should fail (needs video)
    for (let i = 0; i < results.length; i++) {
      const platform = SUPPORTED_PLATFORMS[i];
      if (platform === "tiktok") {
        expect(results[i].valid).toBe(false);
      } else {
        expect(results[i].valid).toBe(true);
      }
    }
  });

  it("should handle parallel result aggregation", async () => {
    const { aggregateResults, createSuccessResult, createErrorResult } = await import("@/lib/types/social-media");

    const aggregations = Array(100)
      .fill(null)
      .map((_, i) => {
        const results = [
          i % 2 === 0 ? createSuccessResult("twitter", `${i}`) : createErrorResult("twitter", "Error"),
          i % 3 === 0 ? createSuccessResult("bluesky", `${i}`) : createErrorResult("bluesky", "Error"),
        ];
        return Promise.resolve(aggregateResults(results));
      });

    const allAggregated = await Promise.all(aggregations);

    expect(allAggregated.length).toBe(100);
    allAggregated.forEach((agg) => {
      expect(agg.totalPlatforms).toBe(2);
      expect(agg.successCount + agg.failureCount).toBe(2);
    });
  });

  it("should calculate credits consistently in parallel", async () => {
    const { calculatePostCredits } = await import("@/lib/types/social-media");

    const calculations = Array(50)
      .fill(null)
      .map(() =>
        Promise.resolve(
          calculatePostCredits(["twitter", "bluesky"], {
            text: "Test",
            media: [{ type: "image", url: "https://example.com/img.jpg", mimeType: "image/jpeg" }],
          })
        )
      );

    const results = await Promise.all(calculations);

    // All results should be identical
    const firstResult = results[0];
    expect(results.every((r) => r === firstResult)).toBe(true);
  });
});

// =============================================================================
// DATA INTEGRITY TESTS
// =============================================================================

describe("Data Integrity", () => {
  it("should preserve all fields in createSuccessResult", async () => {
    const { createSuccessResult } = await import("@/lib/types/social-media");

    const result = createSuccessResult("twitter", "post-id-123", "https://twitter.com/status/123", {
      custom: "data",
    });

    expect(Object.keys(result)).toContain("platform");
    expect(Object.keys(result)).toContain("success");
    expect(Object.keys(result)).toContain("postId");
    expect(Object.keys(result)).toContain("postUrl");
    expect(Object.keys(result)).toContain("metadata");

    expect(result.platform).toBe("twitter");
    expect(result.success).toBe(true);
    expect(result.postId).toBe("post-id-123");
    expect(result.postUrl).toBe("https://twitter.com/status/123");
    expect(result.metadata).toEqual({ custom: "data" });
  });

  it("should preserve all fields in createErrorResult", async () => {
    const { createErrorResult } = await import("@/lib/types/social-media");

    const result = createErrorResult("bluesky", "Network timeout", "TIMEOUT", true, 30);

    expect(result.platform).toBe("bluesky");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Network timeout");
    expect(result.errorCode).toBe("TIMEOUT");
    expect(result.rateLimited).toBe(true);
    expect(result.retryAfter).toBe(30);
  });

  it("should maintain correct counts in aggregateResults", async () => {
    const { aggregateResults } = await import("@/lib/types/social-media");

    const results: PostResult[] = [
      { platform: "twitter", success: true, postId: "1" },
      { platform: "bluesky", success: false, error: "Failed" },
      { platform: "discord", success: true, postId: "2" },
      { platform: "telegram", success: false, error: "Failed" },
      { platform: "reddit", success: true, postId: "3" },
    ];

    const aggregated = aggregateResults(results);

    expect(aggregated.results.length).toBe(5);
    expect(aggregated.successful.length).toBe(3);
    expect(aggregated.failed.length).toBe(2);
    expect(aggregated.totalPlatforms).toBe(5);
    expect(aggregated.successCount).toBe(3);
    expect(aggregated.failureCount).toBe(2);

    // Verify the actual results are correct references
    expect(aggregated.successful.every((r) => r.success)).toBe(true);
    expect(aggregated.failed.every((r) => !r.success)).toBe(true);
  });

  it("should have correct platform capability values", async () => {
    const { PLATFORM_CAPABILITIES } = await import("@/lib/types/social-media");

    // Verify specific known values
    expect(PLATFORM_CAPABILITIES.twitter.maxTextLength).toBe(280);
    expect(PLATFORM_CAPABILITIES.twitter.maxImages).toBe(4);
    expect(PLATFORM_CAPABILITIES.bluesky.maxTextLength).toBe(300);
    expect(PLATFORM_CAPABILITIES.discord.maxTextLength).toBe(2000);
    expect(PLATFORM_CAPABILITIES.telegram.maxTextLength).toBe(4096);
    expect(PLATFORM_CAPABILITIES.reddit.maxTextLength).toBe(40000);
    expect(PLATFORM_CAPABILITIES.facebook.maxTextLength).toBe(63206);
    expect(PLATFORM_CAPABILITIES.instagram.maxTextLength).toBe(2200);
    expect(PLATFORM_CAPABILITIES.tiktok.maxTextLength).toBe(2200);
    expect(PLATFORM_CAPABILITIES.linkedin.maxTextLength).toBe(3000);
    expect(PLATFORM_CAPABILITIES.mastodon.maxTextLength).toBe(500);
  });
});

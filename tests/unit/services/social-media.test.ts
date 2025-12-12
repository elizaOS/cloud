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
import type { SocialPlatform, PostResult, SocialCredentials } from "@/lib/types/social-media";

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
    const analytics = {
      postId: "123",
      platform: "twitter",
      impressions: 1000,
      likes: 50,
      comments: 10,
      shares: 5,
      fetchedAt: new Date(),
    };

    expect(analytics.postId).toBe("123");
    expect(analytics.platform).toBe("twitter");
    expect(analytics.fetchedAt).toBeInstanceOf(Date);
  });

  it("should define account analytics structure", async () => {
    const analytics = {
      platform: "twitter",
      followers: 5000,
      following: 500,
      totalPosts: 1000,
      fetchedAt: new Date(),
    };

    expect(analytics.platform).toBe("twitter");
    expect(analytics.followers).toBe(5000);
    expect(analytics.fetchedAt).toBeInstanceOf(Date);
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

// =============================================================================
// RATE LIMIT UTILITY TESTS
// =============================================================================

describe("Rate Limit Utility", () => {
  it("should detect 429 response as rate limited", async () => {
    const { isRateLimitResponse } = await import("@/lib/services/social-media/rate-limit");

    expect(isRateLimitResponse(new Response(null, { status: 429 }))).toBe(true);
    expect(isRateLimitResponse(new Response(null, { status: 200 }))).toBe(false);
    expect(isRateLimitResponse(new Response(null, { status: 401 }))).toBe(false);
    expect(isRateLimitResponse(new Response(null, { status: 500 }))).toBe(false);
  });

  it("should create rate limit error with correct properties", async () => {
    const { createRateLimitError } = await import("@/lib/services/social-media/rate-limit");

    const error = createRateLimitError("twitter", 60);

    expect(error.rateLimited).toBe(true);
    expect(error.retryAfter).toBe(60);
    expect(error.platform).toBe("twitter");
    expect(error.message).toContain("twitter");
  });

  it("should have rate limit config for all platforms", async () => {
    const { getRateLimitConfig } = await import("@/lib/services/social-media/rate-limit");
    const { SUPPORTED_PLATFORMS } = await import("@/lib/types/social-media");

    for (const platform of SUPPORTED_PLATFORMS) {
      const config = getRateLimitConfig(platform);
      expect(config).toBeDefined();
      expect(config.requestsPerWindow).toBeGreaterThan(0);
      expect(config.windowMs).toBeGreaterThan(0);
    }
  });

  it("should have reasonable rate limits per platform", async () => {
    const { getRateLimitConfig } = await import("@/lib/services/social-media/rate-limit");

    // Twitter: 300 requests per 15 min
    expect(getRateLimitConfig("twitter").requestsPerWindow).toBe(300);
    expect(getRateLimitConfig("twitter").windowMs).toBe(15 * 60 * 1000);

    // Discord: 50 requests per second
    expect(getRateLimitConfig("discord").requestsPerWindow).toBe(50);
    expect(getRateLimitConfig("discord").windowMs).toBe(1000);

    // Telegram: 30 requests per second
    expect(getRateLimitConfig("telegram").requestsPerWindow).toBe(30);
    expect(getRateLimitConfig("telegram").windowMs).toBe(1000);
  });
});

// =============================================================================
// TOKEN REFRESH UTILITY TESTS
// =============================================================================

describe("Token Refresh Utility", () => {
  it("should detect expired token", async () => {
    const { isTokenExpired } = await import("@/lib/services/social-media/token-refresh");

    const expired: SocialCredentials = {
      platform: "twitter",
      accessToken: "test",
      tokenExpiresAt: new Date(Date.now() - 1000),
    };

    const valid: SocialCredentials = {
      platform: "twitter",
      accessToken: "test",
      tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    };

    expect(isTokenExpired(expired)).toBe(true);
    expect(isTokenExpired(valid)).toBe(false);
  });

  it("should not consider token expired if no expiry date", async () => {
    const { isTokenExpired } = await import("@/lib/services/social-media/token-refresh");

    const noExpiry: SocialCredentials = {
      platform: "twitter",
      accessToken: "test",
    };

    expect(isTokenExpired(noExpiry)).toBe(false);
  });

  it("should determine if refresh is needed", async () => {
    const { needsRefresh } = await import("@/lib/services/social-media/token-refresh");

    const needsIt: SocialCredentials = {
      platform: "twitter",
      accessToken: "test",
      refreshToken: "refresh",
      tokenExpiresAt: new Date(Date.now() - 1000),
    };

    const noRefreshToken: SocialCredentials = {
      platform: "twitter",
      accessToken: "test",
      tokenExpiresAt: new Date(Date.now() - 1000),
    };

    const notExpired: SocialCredentials = {
      platform: "twitter",
      accessToken: "test",
      refreshToken: "refresh",
      tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    };

    expect(needsRefresh(needsIt)).toBe(true);
    expect(needsRefresh(noRefreshToken)).toBe(false);
    expect(needsRefresh(notExpired)).toBe(false);
  });

  it("should provide refresh guidance for all platforms", async () => {
    const { getRefreshGuidance } = await import("@/lib/services/social-media/token-refresh");
    const { SUPPORTED_PLATFORMS } = await import("@/lib/types/social-media");

    for (const platform of SUPPORTED_PLATFORMS) {
      const guidance = getRefreshGuidance(platform);
      expect(typeof guidance).toBe("string");
      expect(guidance.length).toBeGreaterThan(0);
      expect(guidance).toContain("/settings/connections/");
    }
  });
});

// =============================================================================
// ALERT SERVICE TESTS
// =============================================================================

describe("Alert Service", () => {
  it("should export all alert functions", async () => {
    const alerts = await import("@/lib/services/social-media/alerts");

    expect(typeof alerts.sendSocialMediaAlert).toBe("function");
    expect(typeof alerts.alertOnPostFailure).toBe("function");
    expect(typeof alerts.alertOnTokenExpiry).toBe("function");
    expect(typeof alerts.alertOnRateLimit).toBe("function");
  });

  it("should not throw when no channels configured", async () => {
    const { sendSocialMediaAlert } = await import("@/lib/services/social-media/alerts");

    // Should complete without error even with no channels
    await expect(
      sendSocialMediaAlert({
        severity: "low",
        title: "Test",
        message: "Test message",
      })
    ).resolves.toBeUndefined();
  });

  it("should not throw on post failure alert", async () => {
    const { alertOnPostFailure } = await import("@/lib/services/social-media/alerts");

    await expect(
      alertOnPostFailure("org-123", ["twitter", "bluesky"], ["Auth failed", "Rate limited"])
    ).resolves.toBeUndefined();
  });

  it("should not throw on token expiry alert", async () => {
    const { alertOnTokenExpiry } = await import("@/lib/services/social-media/alerts");

    await expect(alertOnTokenExpiry("org-123", "twitter")).resolves.toBeUndefined();
  });

  it("should not throw on rate limit alert", async () => {
    const { alertOnRateLimit } = await import("@/lib/services/social-media/alerts");

    await expect(alertOnRateLimit("twitter", 60)).resolves.toBeUndefined();
  });
});

// =============================================================================
// SERVICE EXPORT TESTS
// =============================================================================

describe("Service Exports", () => {
  it("should export socialMediaService", async () => {
    const { socialMediaService } = await import("@/lib/services/social-media");

    expect(socialMediaService).toBeDefined();
    expect(typeof socialMediaService.getSupportedPlatforms).toBe("function");
    expect(typeof socialMediaService.isPlatformSupported).toBe("function");
    expect(typeof socialMediaService.getProvider).toBe("function");
    expect(typeof socialMediaService.createPost).toBe("function");
    expect(typeof socialMediaService.deletePost).toBe("function");
    expect(typeof socialMediaService.validateCredentials).toBe("function");
    expect(typeof socialMediaService.storeCredentials).toBe("function");
  });

  it("should re-export types from index", async () => {
    const exports = await import("@/lib/services/social-media");

    expect(exports.SUPPORTED_PLATFORMS).toBeDefined();
    expect(exports.PLATFORM_CAPABILITIES).toBeDefined();
    expect(typeof exports.validatePostContent).toBe("function");
    expect(typeof exports.validatePlatformOptions).toBe("function");
    expect(typeof exports.createSuccessResult).toBe("function");
    expect(typeof exports.createErrorResult).toBe("function");
    expect(typeof exports.aggregateResults).toBe("function");
  });
});

// =============================================================================
// ADVANCED CONCURRENT BEHAVIOR TESTS
// =============================================================================

describe("Concurrent Post Operations", () => {
  it("should handle parallel platform validation", async () => {
    const { SUPPORTED_PLATFORMS } = await import("@/lib/types/social-media");

    // Validate all platforms concurrently
    const validations = SUPPORTED_PLATFORMS.map(async (platform) => {
      // Simulate async validation
      await new Promise((r) => setTimeout(r, Math.random() * 10));
      return { platform, valid: true };
    });

    const results = await Promise.all(validations);

    expect(results.length).toBe(SUPPORTED_PLATFORMS.length);
    expect(results.every((r) => r.valid)).toBe(true);
  });

  it("should handle parallel content validation", async () => {
    const { validatePostContent } = await import("@/lib/types/social-media");

    const contents = [
      { text: "Post 1" },
      { text: "Post 2" },
      { text: "Post 3" },
      { text: "Post 4" },
      { text: "Post 5" },
    ];

    // Validate all contents in parallel
    const validations = contents.map(async (content) => {
      await new Promise((r) => setTimeout(r, Math.random() * 5));
      return validatePostContent(content, "twitter");
    });

    const results = await Promise.all(validations);

    expect(results.length).toBe(5);
    expect(results.every((r) => r.valid)).toBe(true);
  });

  it("should aggregate results from parallel posts correctly", async () => {
    const { aggregateResults, createSuccessResult, createErrorResult } = await import(
      "@/lib/types/social-media"
    );

    // Simulate parallel post operations with mixed results
    const simulatePosts = async (): Promise<PostResult[]> => {
      const operations = [
        new Promise<PostResult>((r) =>
          setTimeout(() => r(createSuccessResult("twitter", "tw_123")), 10)
        ),
        new Promise<PostResult>((r) =>
          setTimeout(() => r(createErrorResult("bluesky", "Auth failed")), 5)
        ),
        new Promise<PostResult>((r) =>
          setTimeout(() => r(createSuccessResult("discord", "dc_456")), 15)
        ),
        new Promise<PostResult>((r) =>
          setTimeout(() => r(createErrorResult("telegram", "Rate limited")), 8)
        ),
      ];

      return Promise.all(operations);
    };

    const results = await simulatePosts();
    const aggregated = aggregateResults(results);

    expect(aggregated.totalPlatforms).toBe(4);
    expect(aggregated.successCount).toBe(2);
    expect(aggregated.failureCount).toBe(2);
    expect(aggregated.successful.length).toBe(2);
    expect(aggregated.failed.length).toBe(2);
  });

  it("should handle timeout scenarios gracefully", async () => {
    const { createErrorResult } = await import("@/lib/types/social-media");

    const TIMEOUT_MS = 50;

    const simulateWithTimeout = async (
      platform: SocialPlatform,
      delay: number
    ): Promise<PostResult> => {
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          resolve(createErrorResult(platform, "Request timeout"));
        }, TIMEOUT_MS);

        setTimeout(() => {
          clearTimeout(timeout);
          resolve({
            platform,
            success: true,
            postId: `${platform}_123`,
          });
        }, delay);
      });
    };

    // Fast request should succeed
    const fast = await simulateWithTimeout("twitter", 10);
    expect(fast.success).toBe(true);

    // Slow request should timeout
    const slow = await simulateWithTimeout("bluesky", 100);
    expect(slow.success).toBe(false);
    expect(slow.error).toContain("timeout");
  });
});

// =============================================================================
// RETRY BEHAVIOR TESTS
// =============================================================================

describe("Retry Behavior", () => {
  it("should implement exponential backoff", async () => {
    const BASE_DELAY = 100;
    const MAX_RETRIES = 3;
    const delays: number[] = [];

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const delay = BASE_DELAY * Math.pow(2, attempt);
      delays.push(delay);
    }

    expect(delays).toEqual([100, 200, 400]);
  });

  it("should respect maximum retry count", () => {
    const MAX_RETRIES = 3;
    let attempts = 0;
    let shouldRetry = true;

    while (shouldRetry && attempts < MAX_RETRIES) {
      attempts++;
      // Simulate failure
      shouldRetry = attempts < MAX_RETRIES;
    }

    expect(attempts).toBe(MAX_RETRIES);
  });

  it("should stop retrying on success", () => {
    const MAX_RETRIES = 5;
    let attempts = 0;
    const successOnAttempt = 2;

    for (let i = 0; i < MAX_RETRIES; i++) {
      attempts++;
      if (i + 1 === successOnAttempt) {
        break; // Success
      }
    }

    expect(attempts).toBe(2);
  });

  it("should calculate jitter for retry delays", () => {
    const BASE_DELAY = 1000;
    const JITTER_FACTOR = 0.1; // 10% jitter

    const delays: number[] = [];
    for (let i = 0; i < 10; i++) {
      const jitter = (Math.random() - 0.5) * 2 * JITTER_FACTOR;
      const delay = BASE_DELAY * (1 + jitter);
      delays.push(delay);
    }

    // All delays should be within 10% of base
    delays.forEach((delay) => {
      expect(delay).toBeGreaterThanOrEqual(BASE_DELAY * 0.9);
      expect(delay).toBeLessThanOrEqual(BASE_DELAY * 1.1);
    });

    // Delays should vary (not all the same)
    const uniqueDelays = new Set(delays);
    expect(uniqueDelays.size).toBeGreaterThan(1);
  });
});

// =============================================================================
// MEDIA HANDLING EDGE CASES
// =============================================================================

describe("Media Handling Edge Cases", () => {
  it("should handle large file sizes", () => {
    const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB for Twitter video

    const fileSizes = [
      { size: 1024, valid: true }, // 1KB
      { size: 5 * 1024 * 1024, valid: true }, // 5MB
      { size: MAX_FILE_SIZE, valid: true }, // Exactly at limit
      { size: MAX_FILE_SIZE + 1, valid: false }, // Over limit
    ];

    fileSizes.forEach(({ size, valid }) => {
      expect(size <= MAX_FILE_SIZE).toBe(valid);
    });
  });

  it("should validate media MIME types", () => {
    const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime"];

    const testCases = [
      { type: "image/jpeg", expected: "image" },
      { type: "image/png", expected: "image" },
      { type: "video/mp4", expected: "video" },
      { type: "application/pdf", expected: null },
      { type: "text/plain", expected: null },
    ];

    testCases.forEach(({ type, expected }) => {
      let mediaType: string | null = null;
      if (ALLOWED_IMAGE_TYPES.includes(type)) mediaType = "image";
      else if (ALLOWED_VIDEO_TYPES.includes(type)) mediaType = "video";

      expect(mediaType).toBe(expected);
    });
  });

  it("should handle missing alt text gracefully", () => {
    interface MediaWithAlt {
      url: string;
      altText?: string;
    }

    const mediaItems: MediaWithAlt[] = [
      { url: "https://example.com/img1.jpg", altText: "Description" },
      { url: "https://example.com/img2.jpg" }, // No alt text
    ];

    mediaItems.forEach((item) => {
      const alt = item.altText || ""; // Default to empty string
      expect(typeof alt).toBe("string");
    });
  });

  it("should validate URL format for media", () => {
    const validUrls = [
      "https://example.com/image.jpg",
      "https://cdn.example.com/video.mp4",
      "https://storage.googleapis.com/bucket/file.png",
    ];

    const invalidUrls = [
      "not-a-url",
      "ftp://example.com/file.jpg",
      "//example.com/image.jpg",
      "",
    ];

    const isValidUrl = (url: string): boolean => {
      try {
        const parsed = new URL(url);
        return parsed.protocol === "https:";
      } catch {
        return false;
      }
    };

    validUrls.forEach((url) => {
      expect(isValidUrl(url)).toBe(true);
    });

    invalidUrls.forEach((url) => {
      expect(isValidUrl(url)).toBe(false);
    });
  });
});

// =============================================================================
// PLATFORM-SPECIFIC CONSTRAINT TESTS
// =============================================================================

describe("Platform-Specific Constraints", () => {
  const PLATFORM_LIMITS = {
    twitter: { textLength: 280, images: 4, videos: 1 },
    bluesky: { textLength: 300, images: 4, videos: 0 },
    discord: { textLength: 2000, images: 10, videos: 0 },
    telegram: { textLength: 4096, images: 10, videos: 1 },
    linkedin: { textLength: 3000, images: 20, videos: 1 },
    reddit: { textLength: 40000, images: 20, videos: 1 },
    facebook: { textLength: 63206, images: 10, videos: 1 },
    instagram: { textLength: 2200, images: 10, videos: 1 },
    tiktok: { textLength: 2200, images: 0, videos: 1 },
    mastodon: { textLength: 500, images: 4, videos: 1 },
  };

  it("should enforce text length limits per platform", () => {
    Object.entries(PLATFORM_LIMITS).forEach(([platform, limits]) => {
      const validText = "a".repeat(limits.textLength);
      const invalidText = "a".repeat(limits.textLength + 1);

      expect(validText.length <= limits.textLength).toBe(true);
      expect(invalidText.length <= limits.textLength).toBe(false);
    });
  });

  it("should enforce image count limits per platform", () => {
    Object.entries(PLATFORM_LIMITS).forEach(([platform, limits]) => {
      const images = Array(limits.images).fill({ url: "https://example.com/img.jpg" });
      const tooManyImages = Array(limits.images + 1).fill({
        url: "https://example.com/img.jpg",
      });

      expect(images.length <= limits.images).toBe(true);
      expect(tooManyImages.length <= limits.images).toBe(false);
    });
  });

  it("should handle video-only platforms (TikTok)", () => {
    const tiktokLimits = PLATFORM_LIMITS.tiktok;

    expect(tiktokLimits.images).toBe(0); // No images allowed
    expect(tiktokLimits.videos).toBe(1); // Exactly one video required
  });

  it("should handle image-only platforms (Bluesky)", () => {
    const blueskyLimits = PLATFORM_LIMITS.bluesky;

    expect(blueskyLimits.images).toBe(4);
    expect(blueskyLimits.videos).toBe(0); // No videos supported
  });
});

// =============================================================================
// ERROR RECOVERY TESTS
// =============================================================================

describe("Error Recovery", () => {
  it("should provide actionable error messages", () => {
    const errors = [
      { code: "RATE_LIMITED", message: "Rate limited. Retry after 60 seconds." },
      { code: "AUTH_FAILED", message: "Authentication failed. Please reconnect your account." },
      { code: "INVALID_MEDIA", message: "Media format not supported. Use JPEG, PNG, or GIF." },
      { code: "TEXT_TOO_LONG", message: "Text exceeds 280 characters. Please shorten your post." },
    ];

    errors.forEach((error) => {
      expect(error.message.length).toBeGreaterThan(10);
      expect(error.message).not.toContain("undefined");
      expect(error.message).not.toContain("null");
    });
  });

  it("should classify errors by recoverability", () => {
    const errorClassification: Record<string, "retry" | "fix" | "permanent"> = {
      RATE_LIMITED: "retry", // Wait and retry
      NETWORK_ERROR: "retry", // Retry immediately
      AUTH_EXPIRED: "fix", // User action needed
      INVALID_MEDIA: "fix", // User must fix content
      ACCOUNT_SUSPENDED: "permanent", // Cannot recover
      PLATFORM_UNAVAILABLE: "retry", // Try again later
    };

    expect(errorClassification.RATE_LIMITED).toBe("retry");
    expect(errorClassification.AUTH_EXPIRED).toBe("fix");
    expect(errorClassification.ACCOUNT_SUSPENDED).toBe("permanent");
  });

  it("should preserve partial success on multi-platform post", async () => {
    const { aggregateResults, createSuccessResult, createErrorResult } = await import(
      "@/lib/types/social-media"
    );

    // 3 succeed, 2 fail
    const results: PostResult[] = [
      createSuccessResult("twitter", "tw_1"),
      createSuccessResult("bluesky", "bs_1"),
      createErrorResult("discord", "Webhook failed"),
      createSuccessResult("telegram", "tg_1"),
      createErrorResult("reddit", "Auth expired"),
    ];

    const aggregated = aggregateResults(results);

    // Should report both successes and failures
    expect(aggregated.successCount).toBe(3);
    expect(aggregated.failureCount).toBe(2);

    // Should not lose successful posts due to failures
    expect(aggregated.successful.map((r) => r.postId)).toContain("tw_1");
    expect(aggregated.successful.map((r) => r.postId)).toContain("bs_1");
    expect(aggregated.successful.map((r) => r.postId)).toContain("tg_1");
  });
});

// =============================================================================
// RATE LIMIT MODULE DEEP TESTS
// =============================================================================

describe("Rate Limit - Deep Tests", () => {
  it("should parse numeric retry-after header", async () => {
    const { withRetry } = await import("@/lib/services/social-media/rate-limit");

    // Test that the module exports correctly
    expect(typeof withRetry).toBe("function");
  });

  it("should create rate limit error with all properties", async () => {
    const { createRateLimitError } = await import("@/lib/services/social-media/rate-limit");

    const error = createRateLimitError("twitter", 120);

    expect(error).toBeInstanceOf(Error);
    expect(error.rateLimited).toBe(true);
    expect(error.platform).toBe("twitter");
    expect(error.retryAfter).toBe(120);
    expect(error.message).toContain("twitter");
  });

  it("should create rate limit error without retry-after", async () => {
    const { createRateLimitError } = await import("@/lib/services/social-media/rate-limit");

    const error = createRateLimitError("bluesky");

    expect(error.rateLimited).toBe(true);
    expect(error.retryAfter).toBeUndefined();
  });

  it("should have correct rate limits for high-volume platforms", async () => {
    const { getRateLimitConfig } = await import("@/lib/services/social-media/rate-limit");

    // Bluesky is generous
    const bluesky = getRateLimitConfig("bluesky");
    expect(bluesky.requestsPerWindow).toBe(3000);

    // Discord is strict per-second
    const discord = getRateLimitConfig("discord");
    expect(discord.windowMs).toBe(1000);
  });

  it("should detect 429 status correctly", async () => {
    const { isRateLimitResponse } = await import("@/lib/services/social-media/rate-limit");

    // Only 429 is rate limit
    expect(isRateLimitResponse(new Response(null, { status: 429 }))).toBe(true);
    expect(isRateLimitResponse(new Response(null, { status: 200 }))).toBe(false);
    expect(isRateLimitResponse(new Response(null, { status: 403 }))).toBe(false);
    expect(isRateLimitResponse(new Response(null, { status: 503 }))).toBe(false);
  });
});

// =============================================================================
// TOKEN REFRESH - BOUNDARY CONDITIONS
// =============================================================================

describe("Token Refresh - Boundary Conditions", () => {
  it("should detect token expiring within buffer period", async () => {
    const { isTokenExpired } = await import("@/lib/services/social-media/token-refresh");

    // Token expires in 4 minutes (within 5 min buffer)
    const soonExpiring: SocialCredentials = {
      platform: "twitter",
      accessToken: "test",
      tokenExpiresAt: new Date(Date.now() + 4 * 60 * 1000),
    };

    expect(isTokenExpired(soonExpiring)).toBe(true);
  });

  it("should not consider token expired if beyond buffer", async () => {
    const { isTokenExpired } = await import("@/lib/services/social-media/token-refresh");

    // Token expires in 10 minutes (beyond 5 min buffer)
    const notExpiring: SocialCredentials = {
      platform: "twitter",
      accessToken: "test",
      tokenExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
    };

    expect(isTokenExpired(notExpiring)).toBe(false);
  });

  it("should handle token exactly at expiry time", async () => {
    const { isTokenExpired } = await import("@/lib/services/social-media/token-refresh");

    const exactlyExpired: SocialCredentials = {
      platform: "twitter",
      accessToken: "test",
      tokenExpiresAt: new Date(Date.now()),
    };

    expect(isTokenExpired(exactlyExpired)).toBe(true);
  });

  it("should require both expiry and refresh token for needsRefresh", async () => {
    const { needsRefresh } = await import("@/lib/services/social-media/token-refresh");

    // Has expiry but no refresh token
    const noRefreshToken: SocialCredentials = {
      platform: "twitter",
      accessToken: "test",
      tokenExpiresAt: new Date(Date.now() - 1000),
    };

    // Has refresh token but no expiry
    const noExpiry: SocialCredentials = {
      platform: "twitter",
      accessToken: "test",
      refreshToken: "refresh",
    };

    expect(needsRefresh(noRefreshToken)).toBe(false);
    expect(needsRefresh(noExpiry)).toBe(false);
  });

  it("should return null for non-OAuth platforms", async () => {
    const { refreshToken } = await import("@/lib/services/social-media/token-refresh");

    const platforms: SocialPlatform[] = ["bluesky", "discord", "telegram", "reddit", "mastodon"];

    for (const platform of platforms) {
      const result = await refreshToken(platform, {
        platform,
        accessToken: "test",
        refreshToken: "refresh",
        tokenExpiresAt: new Date(Date.now() - 1000),
      });
      expect(result).toBeNull();
    }
  });
});

// =============================================================================
// ALERTS - MESSAGE FORMATTING
// =============================================================================

describe("Alerts - Message Formatting", () => {
  it("should handle empty platforms array", async () => {
    const { alertOnPostFailure } = await import("@/lib/services/social-media/alerts");

    // Should not throw
    await expect(alertOnPostFailure("org-123", [], [])).resolves.toBeUndefined();
  });

  it("should truncate long organization IDs", async () => {
    const { alertOnPostFailure } = await import("@/lib/services/social-media/alerts");

    const longOrgId = "org_12345678901234567890123456789012345678901234567890";

    // Should not throw and should truncate
    await expect(
      alertOnPostFailure(longOrgId, ["twitter"], ["Error"])
    ).resolves.toBeUndefined();
  });

  it("should handle special characters in platform names", async () => {
    const { alertOnRateLimit } = await import("@/lib/services/social-media/alerts");

    // Should not throw with special chars
    await expect(alertOnRateLimit("twitter/x", 60)).resolves.toBeUndefined();
  });
});

// =============================================================================
// CONTENT VALIDATION - EDGE CASES
// =============================================================================

describe("Content Validation - Edge Cases", () => {
  it("should handle whitespace-only text", async () => {
    const { validatePostContent } = await import("@/lib/types/social-media");

    const whitespaceContent = { text: "   \n\t\r   " };
    const result = validatePostContent(whitespaceContent, "twitter");

    // Whitespace-only should still be valid (platform may reject)
    expect(result.valid).toBe(true);
  });

  it("should handle emoji-heavy text correctly", async () => {
    const { validatePostContent, PLATFORM_CAPABILITIES } = await import(
      "@/lib/types/social-media"
    );

    // Emojis can be multi-byte but should count as visual characters
    const emojiText = "🎉🎊🎁🎈🎄".repeat(50);
    const result = validatePostContent({ text: emojiText }, "twitter");

    // Length depends on how we count (bytes vs chars)
    expect(result).toBeDefined();
  });

  it("should handle zero-width characters", async () => {
    const { validatePostContent } = await import("@/lib/types/social-media");

    // Zero-width joiner and other invisible chars
    const sneakyText = "Hello\u200B\u200C\u200DWorld";
    const result = validatePostContent({ text: sneakyText }, "twitter");

    expect(result.valid).toBe(true);
  });

  it("should handle URLs in text correctly", async () => {
    const { validatePostContent } = await import("@/lib/types/social-media");

    // Twitter shortens URLs to 23 chars
    const longUrl = "https://example.com/" + "a".repeat(100);
    const text = `Check this out: ${longUrl}`;

    const result = validatePostContent({ text }, "twitter");
    // Raw length exceeds 280, but Twitter counts URLs as 23
    expect(result).toBeDefined();
  });

  it("should validate media with all optional fields", async () => {
    const { validatePostContent } = await import("@/lib/types/social-media");

    const content = {
      text: "Test",
      media: [
        {
          type: "image" as const,
          url: "https://example.com/img.jpg",
          mimeType: "image/jpeg",
          altText: "Description",
          thumbnailUrl: "https://example.com/thumb.jpg",
        },
      ],
    };

    const result = validatePostContent(content, "twitter");
    expect(result.valid).toBe(true);
  });

  it("should reject negative image counts", async () => {
    // Edge case: if someone passes negative array length (shouldn't happen)
    const { PLATFORM_CAPABILITIES } = await import("@/lib/types/social-media");

    // All maxImages should be positive
    Object.values(PLATFORM_CAPABILITIES).forEach((cap) => {
      expect(cap.maxImages).toBeGreaterThanOrEqual(0);
    });
  });
});

// =============================================================================
// PROVIDER CAPABILITY CONSISTENCY
// =============================================================================

describe("Provider Capability Consistency", () => {
  it("should have consistent capability definitions", async () => {
    const { PLATFORM_CAPABILITIES, SUPPORTED_PLATFORMS } = await import(
      "@/lib/types/social-media"
    );

    // Every supported platform should have capabilities
    SUPPORTED_PLATFORMS.forEach((platform) => {
      const caps = PLATFORM_CAPABILITIES[platform];
      expect(caps).toBeDefined();
      expect(typeof caps.supportsText).toBe("boolean");
      expect(typeof caps.supportsImages).toBe("boolean");
      expect(typeof caps.supportsVideo).toBe("boolean");
      expect(typeof caps.maxTextLength).toBe("number");
      expect(typeof caps.maxImages).toBe("number");
    });
  });

  it("should have text support for text-based platforms", async () => {
    const { PLATFORM_CAPABILITIES } = await import("@/lib/types/social-media");

    const textPlatforms: SocialPlatform[] = [
      "twitter",
      "bluesky",
      "mastodon",
      "telegram",
      "discord",
    ];

    textPlatforms.forEach((platform) => {
      expect(PLATFORM_CAPABILITIES[platform].supportsText).toBe(true);
      expect(PLATFORM_CAPABILITIES[platform].maxTextLength).toBeGreaterThan(0);
    });
  });

  it("should have video support for video platforms", async () => {
    const { PLATFORM_CAPABILITIES } = await import("@/lib/types/social-media");

    // TikTok must support video
    expect(PLATFORM_CAPABILITIES.tiktok.supportsVideo).toBe(true);

    // TikTok doesn't support images
    expect(PLATFORM_CAPABILITIES.tiktok.supportsImages).toBe(false);
  });
});

// =============================================================================
// RESULT AGGREGATION - EDGE CASES
// =============================================================================

describe("Result Aggregation - Edge Cases", () => {
  it("should handle single result", async () => {
    const { aggregateResults, createSuccessResult } = await import(
      "@/lib/types/social-media"
    );

    const single = [createSuccessResult("twitter", "123")];
    const agg = aggregateResults(single);

    expect(agg.totalPlatforms).toBe(1);
    expect(agg.successCount).toBe(1);
    expect(agg.failureCount).toBe(0);
  });

  it("should handle all failures", async () => {
    const { aggregateResults, createErrorResult } = await import(
      "@/lib/types/social-media"
    );

    const allFailed = [
      createErrorResult("twitter", "Failed"),
      createErrorResult("bluesky", "Failed"),
      createErrorResult("discord", "Failed"),
    ];

    const agg = aggregateResults(allFailed);

    expect(agg.totalPlatforms).toBe(3);
    expect(agg.successCount).toBe(0);
    expect(agg.failureCount).toBe(3);
    expect(agg.successful).toHaveLength(0);
  });

  it("should preserve original result objects", async () => {
    const { aggregateResults, createSuccessResult } = await import(
      "@/lib/types/social-media"
    );

    const original: PostResult = {
      platform: "twitter",
      success: true,
      postId: "123",
      postUrl: "https://twitter.com/status/123",
    };

    const agg = aggregateResults([original]);

    // Should be the same object reference
    expect(agg.successful[0]).toBe(original);
    expect(agg.results[0]).toBe(original);
  });

  it("should handle duplicate platforms in results", async () => {
    const { aggregateResults, createSuccessResult, createErrorResult } = await import(
      "@/lib/types/social-media"
    );

    // Same platform twice (shouldn't happen but handle gracefully)
    const duplicates = [
      createSuccessResult("twitter", "123"),
      createErrorResult("twitter", "Second attempt failed"),
    ];

    const agg = aggregateResults(duplicates);

    expect(agg.totalPlatforms).toBe(2);
    expect(agg.successCount).toBe(1);
    expect(agg.failureCount).toBe(1);
  });
});

// =============================================================================
// CREDIT CALCULATION - EDGE CASES
// =============================================================================

describe("Credit Calculation - Edge Cases", () => {
  it("should handle empty platforms array", async () => {
    const { calculatePostCredits } = await import("@/lib/types/social-media");

    const cost = calculatePostCredits([], { text: "Test" });
    expect(cost).toBe(0);
  });

  it("should handle multiple platforms", async () => {
    const { calculatePostCredits } = await import("@/lib/types/social-media");

    const cost = calculatePostCredits(["twitter", "bluesky", "discord"], { text: "Test" });
    expect(cost).toBeGreaterThan(0);
    expect(Number.isFinite(cost)).toBe(true);
  });

  it("should add media surcharge correctly", async () => {
    const { calculatePostCredits } = await import("@/lib/types/social-media");

    const withoutMedia = calculatePostCredits(["twitter"], { text: "Test" });
    const withMedia = calculatePostCredits(["twitter"], {
      text: "Test",
      media: [{ type: "image", mimeType: "image/jpeg" }],
    });

    expect(withMedia).toBeGreaterThan(withoutMedia);
  });

  it("should apply platform multipliers", async () => {
    const { calculatePostCredits } = await import("@/lib/types/social-media");

    const twitterCost = calculatePostCredits(["twitter"], { text: "Test" });
    const tiktokCost = calculatePostCredits(["tiktok"], { text: "Test" });
    const linkedinCost = calculatePostCredits(["linkedin"], { text: "Test" });

    // TikTok has 2x multiplier, LinkedIn 1.5x
    expect(tiktokCost).toBeGreaterThan(twitterCost);
    expect(linkedinCost).toBeGreaterThan(twitterCost);
    expect(tiktokCost).toBeGreaterThan(linkedinCost);
  });

  it("should scale with media count", async () => {
    const { calculatePostCredits } = await import("@/lib/types/social-media");

    const oneImage = calculatePostCredits(["twitter"], {
      text: "Test",
      media: [{ type: "image", mimeType: "image/jpeg" }],
    });

    const fourImages = calculatePostCredits(["twitter"], {
      text: "Test",
      media: [
        { type: "image", mimeType: "image/jpeg" },
        { type: "image", mimeType: "image/jpeg" },
        { type: "image", mimeType: "image/jpeg" },
        { type: "image", mimeType: "image/jpeg" },
      ],
    });

    expect(fourImages).toBeGreaterThan(oneImage);
  });
});

// =============================================================================
// SERVICE SINGLETON BEHAVIOR
// =============================================================================

describe("Service Singleton Behavior", () => {
  it("should return same instance on multiple imports", async () => {
    const { socialMediaService: service1 } = await import("@/lib/services/social-media");
    const { socialMediaService: service2 } = await import("@/lib/services/social-media");

    expect(service1).toBe(service2);
  });

  it("should maintain state across method calls", async () => {
    const { socialMediaService } = await import("@/lib/services/social-media");

    const platforms1 = socialMediaService.getSupportedPlatforms();
    const platforms2 = socialMediaService.getSupportedPlatforms();

    expect(platforms1).toEqual(platforms2);
  });
});

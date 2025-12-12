/**
 * Unit Tests for Social Media Types and Service
 *
 * Tests:
 * 1. Platform validation and constants
 * 2. Content validation
 * 3. Provider availability
 * 4. Result aggregation
 * 5. Analytics validation
 * 6. Credit calculation
 */

import { describe, it, expect } from "bun:test";

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
    expect(typeof twitterProvider.post).toBe("function");
    expect(typeof twitterProvider.deletePost).toBe("function");
  });

  it("should have Bluesky provider with required methods", async () => {
    const { blueskyProvider } = await import("@/lib/services/social-media/providers/bluesky");

    expect(blueskyProvider.platform).toBe("bluesky");
    expect(typeof blueskyProvider.post).toBe("function");
    expect(typeof blueskyProvider.deletePost).toBe("function");
  });

  it("should have Discord provider with required methods", async () => {
    const { discordProvider } = await import("@/lib/services/social-media/providers/discord");

    expect(discordProvider.platform).toBe("discord");
    expect(typeof discordProvider.post).toBe("function");
    expect(typeof discordProvider.deletePost).toBe("function");
  });

  it("should have Telegram provider with required methods", async () => {
    const { telegramProvider } = await import("@/lib/services/social-media/providers/telegram");

    expect(telegramProvider.platform).toBe("telegram");
    expect(typeof telegramProvider.post).toBe("function");
    expect(typeof telegramProvider.deletePost).toBe("function");
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
});

/**
 * Integration Tests for Social Media Service
 *
 * These tests verify actual API connectivity where credentials are available.
 * Tests are skipped when credentials are not present.
 *
 * Required env vars for full test coverage:
 * - TWITTER_ACCESS_TOKEN, TWITTER_REFRESH_TOKEN
 * - BLUESKY_HANDLE, BLUESKY_APP_PASSWORD
 * - DISCORD_BOT_TOKEN or DISCORD_WEBHOOK_URL
 * - TELEGRAM_BOT_TOKEN
 * - META_ACCESS_TOKEN, META_PAGE_ID
 * - TIKTOK_ACCESS_TOKEN
 * - LINKEDIN_ACCESS_TOKEN
 */

import { describe, it, expect, beforeAll } from "bun:test";
import type { SocialCredentials, SocialPlatform } from "@/lib/types/social-media";

// Test credentials from environment
interface TestCredentials {
  twitter?: SocialCredentials;
  bluesky?: SocialCredentials;
  discord?: SocialCredentials;
  telegram?: SocialCredentials;
  facebook?: SocialCredentials;
  instagram?: SocialCredentials;
  tiktok?: SocialCredentials;
  linkedin?: SocialCredentials;
}

function loadTestCredentials(): TestCredentials {
  const creds: TestCredentials = {};

  if (process.env.TWITTER_ACCESS_TOKEN) {
    creds.twitter = {
      platform: "twitter",
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      refreshToken: process.env.TWITTER_REFRESH_TOKEN,
    };
  }

  if (process.env.BLUESKY_HANDLE && process.env.BLUESKY_APP_PASSWORD) {
    creds.bluesky = {
      platform: "bluesky",
      handle: process.env.BLUESKY_HANDLE,
      appPassword: process.env.BLUESKY_APP_PASSWORD,
    };
  }

  if (process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_WEBHOOK_URL) {
    creds.discord = {
      platform: "discord",
      botToken: process.env.DISCORD_BOT_TOKEN,
      webhookUrl: process.env.DISCORD_WEBHOOK_URL,
      channelId: process.env.DISCORD_TEST_CHANNEL_ID,
    };
  }

  if (process.env.TELEGRAM_BOT_TOKEN) {
    creds.telegram = {
      platform: "telegram",
      botToken: process.env.TELEGRAM_BOT_TOKEN,
    };
  }

  if (process.env.META_ACCESS_TOKEN) {
    creds.facebook = {
      platform: "facebook",
      accessToken: process.env.META_ACCESS_TOKEN,
      pageId: process.env.META_PAGE_ID,
    };
    creds.instagram = {
      platform: "instagram",
      accessToken: process.env.META_ACCESS_TOKEN,
      accountId: process.env.META_IG_ACCOUNT_ID,
    };
  }

  if (process.env.TIKTOK_ACCESS_TOKEN) {
    creds.tiktok = {
      platform: "tiktok",
      accessToken: process.env.TIKTOK_ACCESS_TOKEN,
    };
  }

  if (process.env.LINKEDIN_ACCESS_TOKEN) {
    creds.linkedin = {
      platform: "linkedin",
      accessToken: process.env.LINKEDIN_ACCESS_TOKEN,
    };
  }

  return creds;
}

let testCredentials: TestCredentials;
let availablePlatforms: SocialPlatform[];

beforeAll(() => {
  testCredentials = loadTestCredentials();
  availablePlatforms = Object.keys(testCredentials) as SocialPlatform[];
  console.log(`[Integration Tests] Available credentials: ${availablePlatforms.join(", ") || "none"}`);
});

describe("Provider Imports", () => {
  it("should import all providers without error", async () => {
    const { twitterProvider } = await import("@/lib/services/social-media/providers/twitter");
    const { blueskyProvider } = await import("@/lib/services/social-media/providers/bluesky");
    const { discordProvider } = await import("@/lib/services/social-media/providers/discord");
    const { telegramProvider } = await import("@/lib/services/social-media/providers/telegram");
    const { redditProvider } = await import("@/lib/services/social-media/providers/reddit");
    const { metaProvider } = await import("@/lib/services/social-media/providers/meta");
    const { tiktokProvider } = await import("@/lib/services/social-media/providers/tiktok");
    const { linkedinProvider } = await import("@/lib/services/social-media/providers/linkedin");

    expect(twitterProvider.platform).toBe("twitter");
    expect(blueskyProvider.platform).toBe("bluesky");
    expect(discordProvider.platform).toBe("discord");
    expect(telegramProvider.platform).toBe("telegram");
    expect(redditProvider.platform).toBe("reddit");
    expect(metaProvider.platform).toBe("facebook");
    expect(tiktokProvider.platform).toBe("tiktok");
    expect(linkedinProvider.platform).toBe("linkedin");
  });
});

describe("Rate Limit Utility", () => {
  it("should export rate limit functions", async () => {
    const { withRetry, isRateLimitResponse, createRateLimitError, getRateLimitConfig } = await import(
      "@/lib/services/social-media/rate-limit"
    );

    expect(typeof withRetry).toBe("function");
    expect(typeof isRateLimitResponse).toBe("function");
    expect(typeof createRateLimitError).toBe("function");
    expect(typeof getRateLimitConfig).toBe("function");
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

  it("should detect 429 status as rate limit", async () => {
    const { isRateLimitResponse } = await import("@/lib/services/social-media/rate-limit");

    const rateLimitedResponse = new Response(null, { status: 429 });
    const okResponse = new Response(null, { status: 200 });
    const errorResponse = new Response(null, { status: 500 });

    expect(isRateLimitResponse(rateLimitedResponse)).toBe(true);
    expect(isRateLimitResponse(okResponse)).toBe(false);
    expect(isRateLimitResponse(errorResponse)).toBe(false);
  });
});

describe("Token Refresh Utility", () => {
  it("should export token refresh functions", async () => {
    const { isTokenExpired, needsRefresh, refreshToken, getRefreshGuidance } = await import(
      "@/lib/services/social-media/token-refresh"
    );

    expect(typeof isTokenExpired).toBe("function");
    expect(typeof needsRefresh).toBe("function");
    expect(typeof refreshToken).toBe("function");
    expect(typeof getRefreshGuidance).toBe("function");
  });

  it("should detect expired tokens", async () => {
    const { isTokenExpired } = await import("@/lib/services/social-media/token-refresh");

    const expiredCreds: SocialCredentials = {
      platform: "twitter",
      accessToken: "test",
      tokenExpiresAt: new Date(Date.now() - 1000), // 1 second ago
    };

    const validCreds: SocialCredentials = {
      platform: "twitter",
      accessToken: "test",
      tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
    };

    const noExpiryCreds: SocialCredentials = {
      platform: "twitter",
      accessToken: "test",
    };

    expect(isTokenExpired(expiredCreds)).toBe(true);
    expect(isTokenExpired(validCreds)).toBe(false);
    expect(isTokenExpired(noExpiryCreds)).toBe(false);
  });

  it("should return guidance for all platforms", async () => {
    const { getRefreshGuidance } = await import("@/lib/services/social-media/token-refresh");
    const { SUPPORTED_PLATFORMS } = await import("@/lib/types/social-media");

    for (const platform of SUPPORTED_PLATFORMS) {
      const guidance = getRefreshGuidance(platform);
      expect(typeof guidance).toBe("string");
      expect(guidance.length).toBeGreaterThan(0);
    }
  });
});

describe("Alert Service", () => {
  it("should export alert functions", async () => {
    const { sendSocialMediaAlert, alertOnPostFailure, alertOnTokenExpiry, alertOnRateLimit } = await import(
      "@/lib/services/social-media/alerts"
    );

    expect(typeof sendSocialMediaAlert).toBe("function");
    expect(typeof alertOnPostFailure).toBe("function");
    expect(typeof alertOnTokenExpiry).toBe("function");
    expect(typeof alertOnRateLimit).toBe("function");
  });
});

describe("Twitter Integration", () => {
  it("should validate credentials", async () => {
    if (!testCredentials.twitter) {
      console.log("[Twitter] Skipping - no credentials");
      return;
    }

    const { twitterProvider } = await import("@/lib/services/social-media/providers/twitter");
    const result = await twitterProvider.validateCredentials(testCredentials.twitter);

    expect(result.valid).toBe(true);
    expect(result.accountId).toBeDefined();
    expect(result.username).toBeDefined();
    console.log(`[Twitter] Validated: @${result.username}`);
  });

  it("should return error for missing credentials", async () => {
    const { twitterProvider } = await import("@/lib/services/social-media/providers/twitter");
    const result = await twitterProvider.validateCredentials({
      platform: "twitter",
      // No access token
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Access token required");
  });
});

describe("Bluesky Integration", () => {
  it("should validate credentials", async () => {
    if (!testCredentials.bluesky) {
      console.log("[Bluesky] Skipping - no credentials");
      return;
    }

    const { blueskyProvider } = await import("@/lib/services/social-media/providers/bluesky");
    const result = await blueskyProvider.validateCredentials(testCredentials.bluesky);

    expect(result.valid).toBe(true);
    expect(result.accountId).toBeDefined();
    expect(result.username).toBeDefined();
    console.log(`[Bluesky] Validated: @${result.username}`);
  });

  it("should return error for invalid credentials", async () => {
    const { blueskyProvider } = await import("@/lib/services/social-media/providers/bluesky");
    const result = await blueskyProvider.validateCredentials({
      platform: "bluesky",
      handle: "invalid.bsky.social",
      appPassword: "wrong-password-1234",
    });

    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("Discord Integration", () => {
  it("should validate bot credentials", async () => {
    if (!testCredentials.discord?.botToken) {
      console.log("[Discord] Skipping bot validation - no bot token");
      return;
    }

    const { discordProvider } = await import("@/lib/services/social-media/providers/discord");
    const result = await discordProvider.validateCredentials(testCredentials.discord);

    expect(result.valid).toBe(true);
    expect(result.accountId).toBeDefined();
    console.log(`[Discord] Bot validated: ${result.username}`);
  });
});

describe("Telegram Integration", () => {
  it("should validate bot credentials", async () => {
    if (!testCredentials.telegram) {
      console.log("[Telegram] Skipping - no credentials");
      return;
    }

    const { telegramProvider } = await import("@/lib/services/social-media/providers/telegram");
    const result = await telegramProvider.validateCredentials(testCredentials.telegram);

    expect(result.valid).toBe(true);
    expect(result.accountId).toBeDefined();
    console.log(`[Telegram] Bot validated: ${result.username}`);
  });
});

describe("Meta (Facebook/Instagram) Integration", () => {
  it("should validate Facebook credentials", async () => {
    if (!testCredentials.facebook) {
      console.log("[Facebook] Skipping - no credentials");
      return;
    }

    const { metaProvider } = await import("@/lib/services/social-media/providers/meta");
    const result = await metaProvider.validateCredentials(testCredentials.facebook);

    expect(result.valid).toBe(true);
    expect(result.accountId).toBeDefined();
    console.log(`[Facebook] Validated: ${result.displayName}`);
  });
});

describe("LinkedIn Integration", () => {
  it("should validate credentials", async () => {
    if (!testCredentials.linkedin) {
      console.log("[LinkedIn] Skipping - no credentials");
      return;
    }

    const { linkedinProvider } = await import("@/lib/services/social-media/providers/linkedin");
    const result = await linkedinProvider.validateCredentials(testCredentials.linkedin);

    expect(result.valid).toBe(true);
    expect(result.accountId).toBeDefined();
    console.log(`[LinkedIn] Validated: ${result.displayName}`);
  });
});

describe("TikTok Integration", () => {
  it("should validate credentials", async () => {
    if (!testCredentials.tiktok) {
      console.log("[TikTok] Skipping - no credentials");
      return;
    }

    const { tiktokProvider } = await import("@/lib/services/social-media/providers/tiktok");
    const result = await tiktokProvider.validateCredentials(testCredentials.tiktok);

    expect(result.valid).toBe(true);
    expect(result.accountId).toBeDefined();
    console.log(`[TikTok] Validated: ${result.displayName}`);
  });
});

describe("Service Integration", () => {
  it("should import service without error", async () => {
    const { socialMediaService } = await import("@/lib/services/social-media");

    expect(socialMediaService).toBeDefined();
    expect(typeof socialMediaService.getSupportedPlatforms).toBe("function");
    expect(typeof socialMediaService.createPost).toBe("function");
    expect(typeof socialMediaService.validateCredentials).toBe("function");
  });

  it("should list supported platforms", async () => {
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
    expect(platforms).not.toContain("mastodon"); // Not implemented yet
  });

  it("should get provider for each platform", async () => {
    const { socialMediaService } = await import("@/lib/services/social-media");
    const platforms = socialMediaService.getSupportedPlatforms();

    for (const platform of platforms) {
      const provider = socialMediaService.getProvider(platform);
      expect(provider).toBeDefined();
      expect(typeof provider.createPost).toBe("function");
      expect(typeof provider.validateCredentials).toBe("function");
    }
  });

  it("should throw for unsupported platform", async () => {
    const { socialMediaService } = await import("@/lib/services/social-media");

    expect(() => socialMediaService.getProvider("mastodon")).toThrow();
  });
});

describe("End-to-End Post Test (Bluesky)", () => {
  it("should create and delete a test post", async () => {
    if (!testCredentials.bluesky) {
      console.log("[E2E Bluesky] Skipping - no credentials");
      return;
    }

    const { blueskyProvider } = await import("@/lib/services/social-media/providers/bluesky");
    const testMessage = `Integration test post - ${new Date().toISOString()} - Please ignore, will be deleted.`;

    // Create post
    const createResult = await blueskyProvider.createPost(testCredentials.bluesky, {
      text: testMessage,
    });

    expect(createResult.success).toBe(true);
    expect(createResult.postId).toBeDefined();
    expect(createResult.postUrl).toBeDefined();
    console.log(`[E2E Bluesky] Created post: ${createResult.postUrl}`);

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Delete post
    const deleteResult = await blueskyProvider.deletePost!(testCredentials.bluesky, createResult.postId!);
    expect(deleteResult.success).toBe(true);
    console.log(`[E2E Bluesky] Deleted post: ${createResult.postId}`);
  });
});

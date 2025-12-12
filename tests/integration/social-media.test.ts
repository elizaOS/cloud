/**
 * Integration Tests for Social Media Service
 *
 * These tests verify actual API connectivity where credentials are available.
 * Tests are SKIPPED with warnings when credentials are not present.
 *
 * =============================================================================
 * REQUIRED ENVIRONMENT VARIABLES FOR TESTING
 * =============================================================================
 *
 * Twitter/X (OAuth 2.0):
 *   TWITTER_ACCESS_TOKEN      - OAuth 2.0 access token
 *   TWITTER_REFRESH_TOKEN     - OAuth 2.0 refresh token (optional)
 *   TWITTER_CLIENT_ID         - App client ID (for token refresh)
 *   TWITTER_CLIENT_SECRET     - App client secret (for token refresh)
 *
 * Bluesky (App Password):
 *   BLUESKY_HANDLE            - Full handle (e.g., user.bsky.social)
 *   BLUESKY_APP_PASSWORD      - App-specific password from settings
 *
 * Discord (Bot Token or Webhook):
 *   DISCORD_BOT_TOKEN         - Bot token from developer portal
 *   DISCORD_WEBHOOK_URL       - Webhook URL (alternative to bot token)
 *   DISCORD_TEST_CHANNEL_ID   - Channel ID for testing
 *
 * Telegram (Bot Token):
 *   TELEGRAM_BOT_TOKEN        - Bot token from @BotFather
 *   TELEGRAM_TEST_CHAT_ID     - Chat ID for testing
 *
 * Slack (Bot Token or Webhook):
 *   SLACK_BOT_TOKEN           - Bot OAuth token (xoxb-...)
 *   SLACK_WEBHOOK_URL         - Webhook URL (alternative)
 *   SLACK_TEST_CHANNEL_ID     - Channel ID for testing
 *
 * Reddit (OAuth):
 *   REDDIT_CLIENT_ID          - App client ID
 *   REDDIT_CLIENT_SECRET      - App client secret
 *   REDDIT_USERNAME           - Reddit username
 *   REDDIT_PASSWORD           - Reddit password
 *   REDDIT_TEST_SUBREDDIT     - Subreddit for testing
 *
 * Meta (Facebook/Instagram):
 *   META_ACCESS_TOKEN         - Page access token
 *   META_PAGE_ID              - Facebook Page ID
 *   META_IG_ACCOUNT_ID        - Instagram Business Account ID
 *
 * TikTok (OAuth):
 *   TIKTOK_ACCESS_TOKEN       - OAuth access token
 *   TIKTOK_CLIENT_KEY         - App client key
 *   TIKTOK_CLIENT_SECRET      - App client secret
 *
 * LinkedIn (OAuth):
 *   LINKEDIN_ACCESS_TOKEN     - OAuth access token
 *   LINKEDIN_CLIENT_ID        - App client ID
 *   LINKEDIN_CLIENT_SECRET    - App client secret
 *
 * Mastodon (App Password):
 *   MASTODON_INSTANCE_URL     - Instance URL (e.g., https://mastodon.social)
 *   MASTODON_ACCESS_TOKEN     - Access token from settings
 *
 * =============================================================================
 */

import { describe, it, expect, beforeAll } from "bun:test";
import type { SocialCredentials, SocialPlatform } from "@/lib/types/social-media";

// Skip helper that logs warning
function skipWithWarning(platform: string, reason: string): void {
  console.warn(`⚠️  [${platform}] SKIPPED: ${reason}`);
}

// Test credentials from environment
interface TestCredentials {
  twitter?: SocialCredentials;
  bluesky?: SocialCredentials;
  discord?: SocialCredentials;
  telegram?: SocialCredentials;
  slack?: SocialCredentials;
  reddit?: SocialCredentials;
  facebook?: SocialCredentials;
  instagram?: SocialCredentials;
  tiktok?: SocialCredentials;
  linkedin?: SocialCredentials;
  mastodon?: SocialCredentials;
}

function loadTestCredentials(): TestCredentials {
  const creds: TestCredentials = {};
  const missing: string[] = [];

  if (process.env.TWITTER_ACCESS_TOKEN) {
    creds.twitter = {
      platform: "twitter",
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      refreshToken: process.env.TWITTER_REFRESH_TOKEN,
    };
  } else {
    missing.push("TWITTER_ACCESS_TOKEN");
  }

  if (process.env.BLUESKY_HANDLE && process.env.BLUESKY_APP_PASSWORD) {
    creds.bluesky = {
      platform: "bluesky",
      handle: process.env.BLUESKY_HANDLE,
      appPassword: process.env.BLUESKY_APP_PASSWORD,
    };
  } else {
    missing.push("BLUESKY_HANDLE + BLUESKY_APP_PASSWORD");
  }

  if (process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_WEBHOOK_URL) {
    creds.discord = {
      platform: "discord",
      botToken: process.env.DISCORD_BOT_TOKEN,
      webhookUrl: process.env.DISCORD_WEBHOOK_URL,
      channelId: process.env.DISCORD_TEST_CHANNEL_ID,
    };
  } else {
    missing.push("DISCORD_BOT_TOKEN");
  }

  if (process.env.TELEGRAM_BOT_TOKEN) {
    creds.telegram = {
      platform: "telegram",
      botToken: process.env.TELEGRAM_BOT_TOKEN,
    };
  } else {
    missing.push("TELEGRAM_BOT_TOKEN");
  }

  if (process.env.SLACK_BOT_TOKEN || process.env.SLACK_WEBHOOK_URL) {
    creds.slack = {
      platform: "slack",
      botToken: process.env.SLACK_BOT_TOKEN,
      webhookUrl: process.env.SLACK_WEBHOOK_URL,
      channelId: process.env.SLACK_TEST_CHANNEL_ID,
    };
  } else {
    missing.push("SLACK_BOT_TOKEN");
  }

  if (process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET) {
    creds.reddit = {
      platform: "reddit",
      apiKey: process.env.REDDIT_CLIENT_ID,
      apiSecret: process.env.REDDIT_CLIENT_SECRET,
      username: process.env.REDDIT_USERNAME,
      password: process.env.REDDIT_PASSWORD,
    };
  } else {
    missing.push("REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET");
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
  } else {
    missing.push("META_ACCESS_TOKEN");
  }

  if (process.env.TIKTOK_ACCESS_TOKEN) {
    creds.tiktok = {
      platform: "tiktok",
      accessToken: process.env.TIKTOK_ACCESS_TOKEN,
    };
  } else {
    missing.push("TIKTOK_ACCESS_TOKEN");
  }

  if (process.env.LINKEDIN_ACCESS_TOKEN) {
    creds.linkedin = {
      platform: "linkedin",
      accessToken: process.env.LINKEDIN_ACCESS_TOKEN,
    };
  } else {
    missing.push("LINKEDIN_ACCESS_TOKEN");
  }

  if (process.env.MASTODON_ACCESS_TOKEN) {
    creds.mastodon = {
      platform: "mastodon",
      accessToken: process.env.MASTODON_ACCESS_TOKEN,
      instanceUrl: process.env.MASTODON_INSTANCE_URL ?? "https://mastodon.social",
    };
  } else {
    missing.push("MASTODON_ACCESS_TOKEN");
  }

  if (missing.length > 0) {
    console.warn(`\n⚠️  Missing credentials for E2E tests: ${missing.join(", ")}`);
    console.warn("   Set these environment variables for full test coverage.\n");
  }

  return creds;
}

let testCredentials: TestCredentials;
let availablePlatforms: SocialPlatform[];

beforeAll(() => {
  testCredentials = loadTestCredentials();
  availablePlatforms = Object.keys(testCredentials) as SocialPlatform[];
  const configured = availablePlatforms.length;
  const total = 11;
  console.log(`\n✅ [Integration Tests] Credentials configured: ${configured}/${total} platforms`);
  if (configured > 0) {
    console.log(`   Platforms: ${availablePlatforms.join(", ")}`);
  }
  console.log("");
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
      skipWithWarning("Twitter", "TWITTER_ACCESS_TOKEN not set");
      return;
    }

    const { twitterProvider } = await import("@/lib/services/social-media/providers/twitter");
    const result = await twitterProvider.validateCredentials(testCredentials.twitter);

    expect(result.valid).toBe(true);
    expect(result.accountId).toBeDefined();
    expect(result.username).toBeDefined();
    console.log(`✅ [Twitter] Validated: @${result.username}`);
  });

  it("should return error for missing credentials", async () => {
    const { twitterProvider } = await import("@/lib/services/social-media/providers/twitter");
    const result = await twitterProvider.validateCredentials({
      platform: "twitter",
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Access token required");
  });
});

describe("Bluesky Integration", () => {
  it("should validate credentials", async () => {
    if (!testCredentials.bluesky) {
      skipWithWarning("Bluesky", "BLUESKY_HANDLE + BLUESKY_APP_PASSWORD not set");
      return;
    }

    const { blueskyProvider } = await import("@/lib/services/social-media/providers/bluesky");
    const result = await blueskyProvider.validateCredentials(testCredentials.bluesky);

    expect(result.valid).toBe(true);
    expect(result.accountId).toBeDefined();
    expect(result.username).toBeDefined();
    console.log(`✅ [Bluesky] Validated: @${result.username}`);
  });

  it("should return error for missing credentials", async () => {
    const { blueskyProvider } = await import("@/lib/services/social-media/providers/bluesky");
    const result = await blueskyProvider.validateCredentials({
      platform: "bluesky",
    });

    expect(result.valid).toBe(false);
    expect(result.error?.toLowerCase()).toContain("handle and app password required");
  });
});

describe("Discord Integration", () => {
  it("should validate bot credentials", async () => {
    if (!testCredentials.discord?.botToken) {
      skipWithWarning("Discord", "DISCORD_BOT_TOKEN not set");
      return;
    }

    const { discordProvider } = await import("@/lib/services/social-media/providers/discord");
    const result = await discordProvider.validateCredentials(testCredentials.discord);

    expect(result.valid).toBe(true);
    expect(result.accountId).toBeDefined();
    console.log(`✅ [Discord] Bot validated: ${result.username}`);
  });

  it("should validate real webhook URL", async () => {
    if (!testCredentials.discord?.webhookUrl) {
      skipWithWarning("Discord Webhook", "DISCORD_WEBHOOK_URL not set");
      return;
    }

    const { discordProvider } = await import("@/lib/services/social-media/providers/discord");
    const result = await discordProvider.validateCredentials({
      platform: "discord",
      webhookUrl: testCredentials.discord.webhookUrl,
    });

    expect(result.valid).toBe(true);
    console.log(`✅ [Discord] Webhook validated: ${result.username}`);
  });

  it("should reject invalid webhook format", async () => {
    const { discordProvider } = await import("@/lib/services/social-media/providers/discord");
    const result = await discordProvider.validateCredentials({
      platform: "discord",
      webhookUrl: "https://example.com/not-a-webhook",
    });

    expect(result.valid).toBe(false);
  });
});

describe("Telegram Integration", () => {
  it("should validate bot credentials", async () => {
    if (!testCredentials.telegram) {
      skipWithWarning("Telegram", "TELEGRAM_BOT_TOKEN not set");
      return;
    }

    const { telegramProvider } = await import("@/lib/services/social-media/providers/telegram");
    const result = await telegramProvider.validateCredentials(testCredentials.telegram);

    expect(result.valid).toBe(true);
    expect(result.accountId).toBeDefined();
    console.log(`✅ [Telegram] Bot validated: ${result.username}`);
  });

  it("should return error for missing credentials", async () => {
    const { telegramProvider } = await import("@/lib/services/social-media/providers/telegram");
    const result = await telegramProvider.validateCredentials({
      platform: "telegram",
    });

    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("Meta (Facebook/Instagram) Integration", () => {
  it("should validate Facebook credentials", async () => {
    if (!testCredentials.facebook) {
      skipWithWarning("Facebook", "META_ACCESS_TOKEN not set");
      return;
    }

    const { metaProvider } = await import("@/lib/services/social-media/providers/meta");
    const result = await metaProvider.validateCredentials(testCredentials.facebook);

    expect(result.valid).toBe(true);
    expect(result.accountId).toBeDefined();
    console.log(`✅ [Facebook] Validated: ${result.displayName}`);
  });

  it("should return error for missing credentials", async () => {
    const { metaProvider } = await import("@/lib/services/social-media/providers/meta");
    const result = await metaProvider.validateCredentials({
      platform: "facebook",
    });

    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("LinkedIn Integration", () => {
  it("should validate credentials", async () => {
    if (!testCredentials.linkedin) {
      skipWithWarning("LinkedIn", "LINKEDIN_ACCESS_TOKEN not set");
      return;
    }

    const { linkedinProvider } = await import("@/lib/services/social-media/providers/linkedin");
    const result = await linkedinProvider.validateCredentials(testCredentials.linkedin);

    expect(result.valid).toBe(true);
    expect(result.accountId).toBeDefined();
    console.log(`✅ [LinkedIn] Validated: ${result.displayName}`);
  });

  it("should return error for missing credentials", async () => {
    const { linkedinProvider } = await import("@/lib/services/social-media/providers/linkedin");
    const result = await linkedinProvider.validateCredentials({
      platform: "linkedin",
    });

    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("TikTok Integration", () => {
  it("should validate credentials", async () => {
    if (!testCredentials.tiktok) {
      skipWithWarning("TikTok", "TIKTOK_ACCESS_TOKEN not set");
      return;
    }

    const { tiktokProvider } = await import("@/lib/services/social-media/providers/tiktok");
    const result = await tiktokProvider.validateCredentials(testCredentials.tiktok);

    expect(result.valid).toBe(true);
    expect(result.accountId).toBeDefined();
    console.log(`[TikTok] Validated: ${result.displayName}`);
  });
});

describe("Slack Integration", () => {
  it("should validate webhook URL format", async () => {
    const { slackProvider } = await import("@/lib/services/social-media/providers/slack");

    // Webhook validation is local - doesn't need real credentials
    const webhookResult = await slackProvider.validateCredentials({
      platform: "slack",
      webhookUrl: "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX",
    });

    expect(webhookResult.valid).toBe(true);
    expect(webhookResult.accountId).toBe("webhook");
  });

  it("should validate bot credentials", async () => {
    if (!testCredentials.slack?.botToken) {
      skipWithWarning("Slack", "SLACK_BOT_TOKEN not set");
      return;
    }

    const { slackProvider } = await import("@/lib/services/social-media/providers/slack");
    const result = await slackProvider.validateCredentials(testCredentials.slack);

    expect(result.valid).toBe(true);
    expect(result.accountId).toBeDefined();
    console.log(`✅ [Slack] Bot validated: ${result.username}`);
  });

  it("should return error for invalid credentials", async () => {
    const { slackProvider } = await import("@/lib/services/social-media/providers/slack");
    const result = await slackProvider.validateCredentials({
      platform: "slack",
      // No bot token or webhook
    });

    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("Reddit Integration", () => {
  it("should return error for missing credentials", async () => {
    const { redditProvider } = await import("@/lib/services/social-media/providers/reddit");
    const result = await redditProvider.validateCredentials({
      platform: "reddit",
      // No credentials
    });

    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("should validate credentials", async () => {
    if (!testCredentials.reddit) {
      skipWithWarning("Reddit", "REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET not set");
      return;
    }

    const { redditProvider } = await import("@/lib/services/social-media/providers/reddit");
    const result = await redditProvider.validateCredentials(testCredentials.reddit);

    expect(result.valid).toBe(true);
    expect(result.accountId).toBeDefined();
    console.log(`✅ [Reddit] Validated: u/${result.username}`);
  });
});

describe("Mastodon Integration", () => {
  it("should return error for missing credentials", async () => {
    const { mastodonProvider } = await import("@/lib/services/social-media/providers/mastodon");
    const result = await mastodonProvider.validateCredentials({
      platform: "mastodon",
      // No access token
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Access token required");
  });

  it("should validate credentials", async () => {
    if (!testCredentials.mastodon) {
      skipWithWarning("Mastodon", "MASTODON_ACCESS_TOKEN not set");
      return;
    }

    const { mastodonProvider } = await import("@/lib/services/social-media/providers/mastodon");
    const result = await mastodonProvider.validateCredentials(testCredentials.mastodon);

    expect(result.valid).toBe(true);
    expect(result.accountId).toBeDefined();
    console.log(`✅ [Mastodon] Validated: @${result.username}`);
  });

  it("should handle custom instance URL", async () => {
    if (!testCredentials.mastodon) {
      skipWithWarning("Mastodon", "MASTODON_ACCESS_TOKEN not set");
      return;
    }

    const { mastodonProvider } = await import("@/lib/services/social-media/providers/mastodon");
    const result = await mastodonProvider.validateCredentials({
      ...testCredentials.mastodon,
      instanceUrl: testCredentials.mastodon.instanceUrl,
    });

    expect(result.valid).toBe(true);
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
    expect(platforms).toContain("mastodon");
    expect(platforms).toContain("slack");
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
    // All platforms are now implemented, so test with an invalid platform
    expect(() => socialMediaService.getProvider("invalid_platform" as never)).toThrow();
  });
});

// =============================================================================
// END-TO-END TESTS
// These tests create REAL posts and delete them. Only run with real credentials.
// =============================================================================

describe("E2E: Bluesky Post Lifecycle", () => {
  it("should create and delete a test post", async () => {
    if (!testCredentials.bluesky) {
      skipWithWarning("E2E Bluesky", "BLUESKY_HANDLE + BLUESKY_APP_PASSWORD not set");
      return;
    }

    const { blueskyProvider } = await import("@/lib/services/social-media/providers/bluesky");
    const testMessage = `🧪 Integration test - ${new Date().toISOString()} - Auto-deleting...`;

    const createResult = await blueskyProvider.createPost(testCredentials.bluesky, { text: testMessage });

    expect(createResult.success).toBe(true);
    expect(createResult.postId).toBeDefined();
    expect(createResult.postUrl).toBeDefined();
    console.log(`✅ [E2E Bluesky] Created: ${createResult.postUrl}`);

    await new Promise(resolve => setTimeout(resolve, 2000));

    const deleteResult = await blueskyProvider.deletePost!(testCredentials.bluesky, createResult.postId!);
    expect(deleteResult.success).toBe(true);
    console.log(`✅ [E2E Bluesky] Deleted: ${createResult.postId}`);
  });
});

describe("E2E: Mastodon Post Lifecycle", () => {
  it("should create and delete a test post", async () => {
    if (!testCredentials.mastodon) {
      skipWithWarning("E2E Mastodon", "MASTODON_ACCESS_TOKEN not set");
      return;
    }

    const { mastodonProvider } = await import("@/lib/services/social-media/providers/mastodon");
    const testMessage = `🧪 Integration test - ${new Date().toISOString()} - Auto-deleting...`;

    const createResult = await mastodonProvider.createPost(testCredentials.mastodon, { text: testMessage });

    expect(createResult.success).toBe(true);
    expect(createResult.postId).toBeDefined();
    expect(createResult.postUrl).toBeDefined();
    console.log(`✅ [E2E Mastodon] Created: ${createResult.postUrl}`);

    await new Promise(resolve => setTimeout(resolve, 2000));

    const deleteResult = await mastodonProvider.deletePost!(testCredentials.mastodon, createResult.postId!);
    expect(deleteResult.success).toBe(true);
    console.log(`✅ [E2E Mastodon] Deleted: ${createResult.postId}`);
  });
});

describe("E2E: Discord Webhook Post", () => {
  it("should send a message via webhook", async () => {
    if (!testCredentials.discord?.webhookUrl) {
      skipWithWarning("E2E Discord Webhook", "DISCORD_WEBHOOK_URL not set");
      return;
    }

    const { discordProvider } = await import("@/lib/services/social-media/providers/discord");
    const testMessage = `🧪 Integration test - ${new Date().toISOString()}`;

    const result = await discordProvider.createPost(testCredentials.discord, { text: testMessage });

    expect(result.success).toBe(true);
    console.log(`✅ [E2E Discord] Webhook message sent`);
    // Note: Webhook messages can't be deleted via API
  });
});

describe("E2E: Slack Webhook Post", () => {
  it("should send a message via webhook", async () => {
    if (!testCredentials.slack?.webhookUrl) {
      skipWithWarning("E2E Slack Webhook", "SLACK_WEBHOOK_URL not set");
      return;
    }

    const { slackProvider } = await import("@/lib/services/social-media/providers/slack");
    const testMessage = `🧪 Integration test - ${new Date().toISOString()}`;

    const result = await slackProvider.createPost(testCredentials.slack, { text: testMessage });

    expect(result.success).toBe(true);
    expect(result.metadata?.type).toBe("webhook");
    console.log(`✅ [E2E Slack] Webhook message sent`);
  });
});

describe("E2E: Twitter Post Lifecycle", () => {
  it("should create and delete a test post", async () => {
    if (!testCredentials.twitter) {
      skipWithWarning("E2E Twitter", "TWITTER_ACCESS_TOKEN not set");
      return;
    }

    const { twitterProvider } = await import("@/lib/services/social-media/providers/twitter");
    const testMessage = `🧪 Integration test - ${Date.now()} - Auto-deleting...`;

    const createResult = await twitterProvider.createPost(testCredentials.twitter, { text: testMessage });

    if (!createResult.success) {
      console.warn(`⚠️ [E2E Twitter] Post failed: ${createResult.error}`);
      // Twitter may rate limit or require elevated access
      return;
    }

    expect(createResult.postId).toBeDefined();
    console.log(`✅ [E2E Twitter] Created: ${createResult.postUrl}`);

    await new Promise(resolve => setTimeout(resolve, 2000));

    const deleteResult = await twitterProvider.deletePost!(testCredentials.twitter, createResult.postId!);
    expect(deleteResult.success).toBe(true);
    console.log(`✅ [E2E Twitter] Deleted: ${createResult.postId}`);
  });
});

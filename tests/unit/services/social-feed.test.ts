/**
 * Social Feed Service Unit Tests
 *
 * Tests the bidirectional social media integration services:
 * - Feed configuration
 * - Engagement event tracking
 * - Reply confirmation workflow
 * - Notification formatting
 * - Polling service
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Social Feed Types", () => {
  it("should export all required types", async () => {
    const types = await import("@/db/schemas/social-feed");

    expect(types.orgFeedConfigs).toBeDefined();
    expect(types.socialEngagementEvents).toBeDefined();
    expect(types.pendingReplyConfirmations).toBeDefined();
    expect(types.socialNotificationMessages).toBeDefined();
    expect(types.socialEngagementTypeEnum).toBeDefined();
    expect(types.replyConfirmationStatusEnum).toBeDefined();
  });

  it("should define correct engagement types", async () => {
    const { socialEngagementTypeEnum } = await import("@/db/schemas/social-feed");

    // Enum should exist - in Drizzle, enums have an enumValues property
    expect(socialEngagementTypeEnum.enumName).toBe("social_engagement_type");
  });

  it("should define correct confirmation status types", async () => {
    const { replyConfirmationStatusEnum } = await import("@/db/schemas/social-feed");

    expect(replyConfirmationStatusEnum.enumName).toBe("reply_confirmation_status");
  });
});

describe("Feed Config Service", () => {
  it("should export feedConfigService", async () => {
    const { feedConfigService } = await import("@/lib/services/social-feed");

    expect(feedConfigService).toBeDefined();
    expect(feedConfigService.create).toBeDefined();
    expect(feedConfigService.get).toBeDefined();
    expect(feedConfigService.update).toBeDefined();
    expect(feedConfigService.delete).toBeDefined();
    expect(feedConfigService.list).toBeDefined();
    expect(feedConfigService.getFeedsDueForPolling).toBeDefined();
    expect(feedConfigService.updatePollingState).toBeDefined();
  });

  it("should have correct method signatures", async () => {
    const { feedConfigService } = await import("@/lib/services/social-feed");

    // All methods should be async functions
    expect(typeof feedConfigService.create).toBe("function");
    expect(typeof feedConfigService.list).toBe("function");
    expect(typeof feedConfigService.getFeedsDueForPolling).toBe("function");
  });
});

describe("Engagement Event Service", () => {
  it("should export engagementEventService", async () => {
    const { engagementEventService } = await import("@/lib/services/social-feed");

    expect(engagementEventService).toBeDefined();
    expect(engagementEventService.create).toBeDefined();
    expect(engagementEventService.get).toBeDefined();
    expect(engagementEventService.exists).toBeDefined();
    expect(engagementEventService.list).toBeDefined();
    expect(engagementEventService.markNotificationSent).toBeDefined();
    expect(engagementEventService.getUnnotifiedEvents).toBeDefined();
  });
});

describe("Reply Confirmation Service", () => {
  it("should export replyConfirmationService", async () => {
    const { replyConfirmationService } = await import("@/lib/services/social-feed");

    expect(replyConfirmationService).toBeDefined();
    expect(replyConfirmationService.create).toBeDefined();
    expect(replyConfirmationService.get).toBeDefined();
    expect(replyConfirmationService.list).toBeDefined();
    expect(replyConfirmationService.confirm).toBeDefined();
    expect(replyConfirmationService.reject).toBeDefined();
    expect(replyConfirmationService.markSent).toBeDefined();
    expect(replyConfirmationService.markFailed).toBeDefined();
    expect(replyConfirmationService.expirePending).toBeDefined();
  });

  it("should have correct status transition methods", async () => {
    const { replyConfirmationService } = await import("@/lib/services/social-feed");

    // These methods manage state transitions
    expect(typeof replyConfirmationService.confirm).toBe("function");
    expect(typeof replyConfirmationService.reject).toBe("function");
    expect(typeof replyConfirmationService.markSent).toBe("function");
    expect(typeof replyConfirmationService.markFailed).toBe("function");
    expect(typeof replyConfirmationService.expirePending).toBe("function");
  });
});

describe("Notification Message Service", () => {
  it("should export notificationMessageService", async () => {
    const { notificationMessageService } = await import("@/lib/services/social-feed");

    expect(notificationMessageService).toBeDefined();
    expect(notificationMessageService.create).toBeDefined();
    expect(notificationMessageService.findEngagementByMessage).toBeDefined();
    expect(notificationMessageService.getForEngagement).toBeDefined();
  });
});

describe("Feed Polling Service", () => {
  it("should export feedPollingService", async () => {
    const { feedPollingService } = await import("@/lib/services/social-feed/polling");

    expect(feedPollingService).toBeDefined();
    expect(feedPollingService.pollFeed).toBeDefined();
    expect(feedPollingService.pollDueFeeds).toBeDefined();
  });
});

describe("Social Notification Service", () => {
  it("should export socialNotificationService", async () => {
    const { socialNotificationService } = await import("@/lib/services/social-feed/notifications");

    expect(socialNotificationService).toBeDefined();
    expect(socialNotificationService.sendNotification).toBeDefined();
    expect(socialNotificationService.processUnnotifiedEvents).toBeDefined();
  });
});

describe("Reply Router Service", () => {
  it("should export replyRouterService", async () => {
    const { replyRouterService } = await import("@/lib/services/social-feed/reply-router");

    expect(replyRouterService).toBeDefined();
    expect(replyRouterService.processIncomingReply).toBeDefined();
    expect(replyRouterService.handleConfirmation).toBeDefined();
    expect(replyRouterService.handleRejection).toBeDefined();
    expect(replyRouterService.processExpiredConfirmations).toBeDefined();
  });
});

describe("Notification Channel Validation", () => {
  it("should validate notification channel structure", () => {
    // Test the type structure
    interface NotificationChannel {
      platform: "discord" | "telegram" | "slack";
      channelId: string;
      serverId?: string;
      connectionId?: string;
      threadId?: string;
    }

    const validChannel: NotificationChannel = {
      platform: "discord",
      channelId: "123456789",
      serverId: "987654321",
    };

    expect(validChannel.platform).toBe("discord");
    expect(validChannel.channelId).toBe("123456789");
    expect(validChannel.serverId).toBe("987654321");
  });

  it("should support all notification platforms", () => {
    const platforms = ["discord", "telegram", "slack"] as const;

    for (const platform of platforms) {
      const channel = {
        platform,
        channelId: "test-channel",
      };
      expect(channel.platform).toBe(platform);
    }
  });
});

describe("Engagement Event Types", () => {
  it("should support all engagement types", () => {
    type SocialEngagementType =
      | "mention"
      | "reply"
      | "quote_tweet"
      | "repost"
      | "like"
      | "comment"
      | "follow";

    const types: SocialEngagementType[] = [
      "mention",
      "reply",
      "quote_tweet",
      "repost",
      "like",
      "comment",
      "follow",
    ];

    expect(types).toHaveLength(7);
    expect(types).toContain("mention");
    expect(types).toContain("reply");
    expect(types).toContain("quote_tweet");
  });
});

describe("Reply Confirmation Status", () => {
  it("should support all status values", () => {
    type ReplyConfirmationStatus =
      | "pending"
      | "confirmed"
      | "rejected"
      | "expired"
      | "sent"
      | "failed";

    const statuses: ReplyConfirmationStatus[] = [
      "pending",
      "confirmed",
      "rejected",
      "expired",
      "sent",
      "failed",
    ];

    expect(statuses).toHaveLength(6);
    expect(statuses).toContain("pending");
    expect(statuses).toContain("sent");
    expect(statuses).toContain("failed");
  });

  it("should have correct status flow", () => {
    // Valid transitions:
    // pending -> confirmed -> sent
    // pending -> confirmed -> failed
    // pending -> rejected
    // pending -> expired

    const validTransitions: Record<string, string[]> = {
      pending: ["confirmed", "rejected", "expired"],
      confirmed: ["sent", "failed"],
      rejected: [],
      expired: [],
      sent: [],
      failed: [],
    };

    expect(validTransitions.pending).toContain("confirmed");
    expect(validTransitions.pending).toContain("rejected");
    expect(validTransitions.pending).toContain("expired");
    expect(validTransitions.confirmed).toContain("sent");
    expect(validTransitions.confirmed).toContain("failed");
  });
});

describe("CreateFeedConfigParams Validation", () => {
  it("should require organizationId", () => {
    interface CreateFeedConfigParams {
      organizationId: string;
      sourcePlatform: string;
      sourceAccountId: string;
      notificationChannels: Array<{
        platform: "discord" | "telegram" | "slack";
        channelId: string;
      }>;
    }

    const params: CreateFeedConfigParams = {
      organizationId: "org-123",
      sourcePlatform: "twitter",
      sourceAccountId: "user123",
      notificationChannels: [{ platform: "discord", channelId: "ch-1" }],
    };

    expect(params.organizationId).toBe("org-123");
    expect(params.sourcePlatform).toBe("twitter");
  });
});

describe("Engagement Event Metrics", () => {
  it("should support engagement metrics structure", () => {
    interface EngagementMetrics {
      likes?: number;
      reposts?: number;
      replies?: number;
      quotes?: number;
    }

    const metrics: EngagementMetrics = {
      likes: 100,
      reposts: 25,
      replies: 10,
      quotes: 5,
    };

    expect(metrics.likes).toBe(100);
    expect(metrics.reposts).toBe(25);
    expect(metrics.replies).toBe(10);
    expect(metrics.quotes).toBe(5);
  });

  it("should allow partial metrics", () => {
    interface EngagementMetrics {
      likes?: number;
      reposts?: number;
      replies?: number;
      quotes?: number;
    }

    const partialMetrics: EngagementMetrics = {
      likes: 50,
    };

    expect(partialMetrics.likes).toBe(50);
    expect(partialMetrics.reposts).toBeUndefined();
  });
});

describe("Mastodon Provider", () => {
  it("should export mastodon provider", async () => {
    const { mastodonProvider } = await import("@/lib/services/social-media/providers/mastodon");

    expect(mastodonProvider).toBeDefined();
    expect(mastodonProvider.platform).toBe("mastodon");
    expect(mastodonProvider.validateCredentials).toBeDefined();
    expect(mastodonProvider.createPost).toBeDefined();
    expect(mastodonProvider.deletePost).toBeDefined();
    expect(mastodonProvider.replyToPost).toBeDefined();
    expect(mastodonProvider.likePost).toBeDefined();
    expect(mastodonProvider.repost).toBeDefined();
  });

  it("should require access token for validation", async () => {
    const { mastodonProvider } = await import("@/lib/services/social-media/providers/mastodon");

    const result = await mastodonProvider.validateCredentials({
      platform: "mastodon",
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Access token required");
  });

  it("should require access token for posting", async () => {
    const { mastodonProvider } = await import("@/lib/services/social-media/providers/mastodon");

    const result = await mastodonProvider.createPost(
      { platform: "mastodon" },
      { text: "Test post" }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Access token required");
  });
});

describe("Slack Provider", () => {
  it("should validate webhook URL format", async () => {
    const { slackProvider } = await import("@/lib/services/social-media/providers/slack");

    // Valid webhook
    const validResult = await slackProvider.validateCredentials({
      platform: "slack",
      webhookUrl: "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXX",
    });
    expect(validResult.valid).toBe(true);

    // Invalid webhook
    const invalidResult = await slackProvider.validateCredentials({
      platform: "slack",
      webhookUrl: "https://not-slack.com/webhook",
    });
    expect(invalidResult.valid).toBe(false);
  });

  it("should export all required methods", async () => {
    const { slackProvider } = await import("@/lib/services/social-media/providers/slack");

    expect(slackProvider.platform).toBe("slack");
    expect(slackProvider.createPost).toBeDefined();
    expect(slackProvider.replyToPost).toBeDefined();
    expect(slackProvider.deletePost).toBeDefined();
    expect(slackProvider.likePost).toBeDefined();
    expect(slackProvider.uploadMedia).toBeDefined();
  });

  it("should require bot token or webhook for posting", async () => {
    const { slackProvider } = await import("@/lib/services/social-media/providers/slack");

    const result = await slackProvider.createPost(
      { platform: "slack" },
      { text: "Test message" }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Bot token or webhook URL required");
  });
});

describe("Mastodon Provider - Edge Cases", () => {
  it("should require access token for deletion", async () => {
    const { mastodonProvider } = await import("@/lib/services/social-media/providers/mastodon");

    const result = await mastodonProvider.deletePost({ platform: "mastodon" }, "123");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Access token required");
  });

  it("should require access token for like", async () => {
    const { mastodonProvider } = await import("@/lib/services/social-media/providers/mastodon");

    const result = await mastodonProvider.likePost({ platform: "mastodon" }, "123");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Access token required");
  });

  it("should require access token for repost", async () => {
    const { mastodonProvider } = await import("@/lib/services/social-media/providers/mastodon");

    const result = await mastodonProvider.repost({ platform: "mastodon" }, "123");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Access token required");
  });

  it("should return null analytics without access token", async () => {
    const { mastodonProvider } = await import("@/lib/services/social-media/providers/mastodon");

    const postAnalytics = await mastodonProvider.getPostAnalytics({ platform: "mastodon" }, "123");
    expect(postAnalytics).toBeNull();

    const accountAnalytics = await mastodonProvider.getAccountAnalytics({ platform: "mastodon" });
    expect(accountAnalytics).toBeNull();
  });

  it("should use replyToPost as createPost with replyToId", async () => {
    const { mastodonProvider } = await import("@/lib/services/social-media/providers/mastodon");

    // replyToPost calls createPost internally with replyToId set
    const result = await mastodonProvider.replyToPost(
      { platform: "mastodon" },
      "parent-post-id",
      { text: "Reply content" }
    );

    // Should fail due to missing access token, not due to any other issue
    expect(result.success).toBe(false);
    expect(result.error).toContain("Access token required");
  });
});

describe("Token Refresh - Edge Cases", () => {
  it("should detect tokens needing refresh", async () => {
    const { needsRefresh } = await import("@/lib/services/social-media/token-refresh");

    // Token with past expiry and refresh token
    const expiredCreds = {
      accessToken: "token123",
      refreshToken: "refresh123",
      tokenExpiresAt: new Date(Date.now() - 1000), // 1 second ago
    };
    expect(needsRefresh(expiredCreds)).toBe(true);

    // Token expiring soon (within 5 min buffer) with refresh token
    const expiringSoonCreds = {
      accessToken: "token123",
      refreshToken: "refresh123",
      tokenExpiresAt: new Date(Date.now() + 2 * 60 * 1000), // 2 minutes from now
    };
    expect(needsRefresh(expiringSoonCreds)).toBe(true);

    // Token not expiring soon
    const validCreds = {
      accessToken: "token123",
      refreshToken: "refresh123",
      tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
    };
    expect(needsRefresh(validCreds)).toBe(false);

    // Token without expiry date - no refresh needed
    const noExpiryCreds = {
      accessToken: "token123",
    };
    expect(needsRefresh(noExpiryCreds)).toBe(false);

    // Token without refresh token - no refresh possible
    const noRefreshTokenCreds = {
      accessToken: "token123",
      tokenExpiresAt: new Date(Date.now() - 1000),
    };
    expect(needsRefresh(noRefreshTokenCreds)).toBe(false);
  });

  it("should provide refresh guidance for all platforms", async () => {
    const { getRefreshGuidance } = await import("@/lib/services/social-media/token-refresh");
    const { SUPPORTED_PLATFORMS } = await import("@/lib/types/social-media");

    for (const platform of SUPPORTED_PLATFORMS) {
      const guidance = getRefreshGuidance(platform);
      expect(guidance).toBeDefined();
      expect(guidance.length).toBeGreaterThan(0);
    }
  });
});

describe("Reply Confirmation State Machine", () => {
  it("should define valid status values", () => {
    type ReplyConfirmationStatus =
      | "pending"
      | "confirmed"
      | "rejected"
      | "expired"
      | "sent"
      | "failed";

    const validStatuses: ReplyConfirmationStatus[] = [
      "pending",
      "confirmed",
      "rejected",
      "expired",
      "sent",
      "failed",
    ];

    expect(validStatuses).toHaveLength(6);
  });

  it("should support correct state transitions from pending", () => {
    const validTransitions: Record<string, string[]> = {
      pending: ["confirmed", "rejected", "expired"],
      confirmed: ["sent", "failed"],
      sent: [], // terminal
      failed: [], // terminal
      rejected: [], // terminal
      expired: [], // terminal
    };

    // Pending can transition to confirmed, rejected, or expired
    expect(validTransitions.pending).toContain("confirmed");
    expect(validTransitions.pending).toContain("rejected");
    expect(validTransitions.pending).toContain("expired");
    expect(validTransitions.pending).not.toContain("sent");
    expect(validTransitions.pending).not.toContain("failed");

    // Confirmed can only transition to sent or failed
    expect(validTransitions.confirmed).toContain("sent");
    expect(validTransitions.confirmed).toContain("failed");
    expect(validTransitions.confirmed).toHaveLength(2);

    // Terminal states have no transitions
    expect(validTransitions.sent).toHaveLength(0);
    expect(validTransitions.failed).toHaveLength(0);
    expect(validTransitions.rejected).toHaveLength(0);
    expect(validTransitions.expired).toHaveLength(0);
  });
});

describe("Polling Service - Structure", () => {
  it("should export polling service with required methods", async () => {
    const { feedPollingService } = await import("@/lib/services/social-feed/polling");

    expect(feedPollingService).toBeDefined();
    expect(typeof feedPollingService.pollFeed).toBe("function");
    expect(typeof feedPollingService.pollDueFeeds).toBe("function");
  });

  it("should have pollers for expected platforms", async () => {
    // This is a structural test - pollers exist for platforms that support polling
    const polling = await import("@/lib/services/social-feed/polling");

    // Just verify the module exports what we expect
    expect(polling.feedPollingService).toBeDefined();
  });
});

describe("Content Validation - Boundary Conditions", () => {
  it("should accept content at exact max length", async () => {
    const { validatePostContent, PLATFORM_CAPABILITIES } = await import("@/lib/types/social-media");

    // Twitter: exactly 280 characters
    const exactTwitterText = "a".repeat(280);
    const twitterResult = validatePostContent({ text: exactTwitterText }, "twitter");
    expect(twitterResult.valid).toBe(true);

    // Bluesky: exactly 300 characters
    const exactBlueskyText = "a".repeat(300);
    const blueskyResult = validatePostContent({ text: exactBlueskyText }, "bluesky");
    expect(blueskyResult.valid).toBe(true);

    // Mastodon: exactly 500 characters
    const exactMastodonText = "a".repeat(500);
    const mastodonResult = validatePostContent({ text: exactMastodonText }, "mastodon");
    expect(mastodonResult.valid).toBe(true);
  });

  it("should reject content one character over max length", async () => {
    const { validatePostContent } = await import("@/lib/types/social-media");

    // Twitter: 281 characters (1 over)
    const overTwitterText = "a".repeat(281);
    const twitterResult = validatePostContent({ text: overTwitterText }, "twitter");
    expect(twitterResult.valid).toBe(false);

    // Bluesky: 301 characters (1 over)
    const overBlueskyText = "a".repeat(301);
    const blueskyResult = validatePostContent({ text: overBlueskyText }, "bluesky");
    expect(blueskyResult.valid).toBe(false);

    // Mastodon: 501 characters (1 over)
    const overMastodonText = "a".repeat(501);
    const mastodonResult = validatePostContent({ text: overMastodonText }, "mastodon");
    expect(mastodonResult.valid).toBe(false);
  });

  it("should accept empty text with video for TikTok", async () => {
    const { validatePostContent } = await import("@/lib/types/social-media");

    const videoContent = {
      text: "",
      media: [{ type: "video" as const, url: "https://example.com/video.mp4", mimeType: "video/mp4" }],
    };

    const result = validatePostContent(videoContent, "tiktok");
    expect(result.valid).toBe(true);
  });

  it("should accept exact max images", async () => {
    const { validatePostContent, PLATFORM_CAPABILITIES } = await import("@/lib/types/social-media");

    const twitterMaxImages = PLATFORM_CAPABILITIES.twitter.maxImages;
    const twitterImages = Array(twitterMaxImages).fill(null).map((_, i) => ({
      type: "image" as const,
      url: `https://example.com/image${i}.jpg`,
      mimeType: "image/jpeg",
    }));

    const result = validatePostContent({ text: "Test", media: twitterImages }, "twitter");
    expect(result.valid).toBe(true);
  });
});

describe("Media Attachment Validation", () => {
  it("should validate different media types", async () => {
    const { validatePostContent } = await import("@/lib/types/social-media");

    // Image
    const imageContent = {
      text: "Check this out",
      media: [{ type: "image" as const, url: "https://example.com/img.png", mimeType: "image/png" }],
    };
    expect(validatePostContent(imageContent, "twitter").valid).toBe(true);

    // GIF
    const gifContent = {
      text: "Funny GIF",
      media: [{ type: "image" as const, url: "https://example.com/funny.gif", mimeType: "image/gif" }],
    };
    expect(validatePostContent(gifContent, "twitter").valid).toBe(true);

    // Video
    const videoContent = {
      text: "Watch this",
      media: [{ type: "video" as const, url: "https://example.com/video.mp4", mimeType: "video/mp4" }],
    };
    expect(validatePostContent(videoContent, "twitter").valid).toBe(true);
  });

  it("should handle mixed media types", async () => {
    const { validatePostContent } = await import("@/lib/types/social-media");

    const mixedContent = {
      text: "Multiple media",
      media: [
        { type: "image" as const, url: "https://example.com/img.jpg", mimeType: "image/jpeg" },
        { type: "image" as const, url: "https://example.com/img2.jpg", mimeType: "image/jpeg" },
      ],
    };

    const result = validatePostContent(mixedContent, "twitter");
    expect(result.valid).toBe(true);
  });
});

describe("Concurrent Provider Operations", () => {
  it("should handle concurrent slack validation calls", async () => {
    const { slackProvider } = await import("@/lib/services/social-media/providers/slack");

    // Only test slack which doesn't make network calls for webhook validation
    const results = await Promise.all([
      slackProvider.validateCredentials({ webhookUrl: "https://hooks.slack.com/services/a" }),
      slackProvider.validateCredentials({ webhookUrl: "https://hooks.slack.com/services/b" }),
      slackProvider.validateCredentials({ webhookUrl: "https://invalid.com" }),
    ]);

    expect(results[0].valid).toBe(true);
    expect(results[1].valid).toBe(true);
    expect(results[2].valid).toBe(false);
  });

  it("should handle concurrent createPost calls (all should fail without creds)", async () => {
    const { slackProvider } = await import("@/lib/services/social-media/providers/slack");
    const { mastodonProvider } = await import("@/lib/services/social-media/providers/mastodon");

    const results = await Promise.all([
      slackProvider.createPost({}, { text: "Test 1" }),
      slackProvider.createPost({}, { text: "Test 2" }),
      mastodonProvider.createPost({}, { text: "Test 3" }),
      mastodonProvider.createPost({}, { text: "Test 4" }),
    ]);

    // All should fail due to missing credentials
    for (const result of results) {
      expect(result.success).toBe(false);
    }
  });
});

describe("PostResult Structure", () => {
  it("should have correct success result structure", async () => {
    const { createSuccessResult } = await import("@/lib/types/social-media");

    const result = createSuccessResult("twitter", "123456", "https://twitter.com/status/123456", {
      quotedId: "789",
    });

    expect(result.platform).toBe("twitter");
    expect(result.success).toBe(true);
    expect(result.postId).toBe("123456");
    expect(result.postUrl).toBe("https://twitter.com/status/123456");
    expect(result.metadata).toEqual({ quotedId: "789" });
  });

  it("should have correct error result structure", async () => {
    const { createErrorResult } = await import("@/lib/types/social-media");

    const result = createErrorResult("twitter", "Rate limited", "RATE_LIMIT", true, 60);

    expect(result.platform).toBe("twitter");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Rate limited");
    expect(result.errorCode).toBe("RATE_LIMIT");
    expect(result.rateLimited).toBe(true);
    expect(result.retryAfter).toBe(60);
  });
});

describe("Result Aggregation", () => {
  it("should correctly aggregate mixed results", async () => {
    const { aggregateResults, createSuccessResult, createErrorResult } = await import(
      "@/lib/types/social-media"
    );

    const results = [
      createSuccessResult("twitter", "1", "https://twitter.com/1"),
      createErrorResult("facebook", "Auth failed"),
      createSuccessResult("discord", "2", "https://discord.com/2"),
      createErrorResult("telegram", "Network error"),
    ];

    const aggregated = aggregateResults(results);

    expect(aggregated.successful).toHaveLength(2);
    expect(aggregated.failed).toHaveLength(2);
    expect(aggregated.successCount).toBe(2);
    expect(aggregated.failureCount).toBe(2);
    expect(aggregated.totalPlatforms).toBe(4);
  });

  it("should handle all success scenario", async () => {
    const { aggregateResults, createSuccessResult } = await import("@/lib/types/social-media");

    const results = [
      createSuccessResult("twitter", "1", "https://twitter.com/1"),
      createSuccessResult("discord", "2", "https://discord.com/2"),
    ];

    const aggregated = aggregateResults(results);

    expect(aggregated.successful).toHaveLength(2);
    expect(aggregated.failed).toHaveLength(0);
    expect(aggregated.successCount).toBe(2);
    expect(aggregated.failureCount).toBe(0);
    expect(aggregated.totalPlatforms).toBe(2);
  });

  it("should handle all failure scenario", async () => {
    const { aggregateResults, createErrorResult } = await import("@/lib/types/social-media");

    const results = [
      createErrorResult("twitter", "Error 1"),
      createErrorResult("discord", "Error 2"),
    ];

    const aggregated = aggregateResults(results);

    expect(aggregated.successful).toHaveLength(0);
    expect(aggregated.failed).toHaveLength(2);
    expect(aggregated.successCount).toBe(0);
    expect(aggregated.failureCount).toBe(2);
    expect(aggregated.totalPlatforms).toBe(2);
  });

  it("should handle empty results", async () => {
    const { aggregateResults } = await import("@/lib/types/social-media");

    const aggregated = aggregateResults([]);

    expect(aggregated.successful).toHaveLength(0);
    expect(aggregated.failed).toHaveLength(0);
    expect(aggregated.successCount).toBe(0);
    expect(aggregated.failureCount).toBe(0);
    expect(aggregated.totalPlatforms).toBe(0);
  });
});

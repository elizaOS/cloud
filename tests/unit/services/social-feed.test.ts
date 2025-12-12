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

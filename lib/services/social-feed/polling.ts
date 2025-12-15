import { logger } from "@/lib/utils/logger";
import { extractErrorMessage } from "@/lib/utils/error-handling";
import { socialMediaService } from "@/lib/services/social-media";
import type {
  SocialCredentials,
  SocialPlatform,
} from "@/lib/types/social-media";
import {
  feedConfigService,
  engagementEventService,
  type OrgFeedConfig,
  type SocialEngagementType,
} from "./index";

interface PolledEngagement {
  eventType: SocialEngagementType;
  sourcePostId: string;
  sourcePostUrl?: string;
  authorId: string;
  authorUsername?: string;
  authorDisplayName?: string;
  authorAvatarUrl?: string;
  authorFollowerCount?: number;
  authorVerified?: boolean;
  originalPostId?: string;
  originalPostUrl?: string;
  originalPostContent?: string;
  content?: string;
  contentHtml?: string;
  mediaUrls?: string[];
  rawData?: Record<string, unknown>;
  engagementMetrics?: {
    likes?: number;
    reposts?: number;
    replies?: number;
    quotes?: number;
  };
}

interface PollResult {
  engagements: PolledEngagement[];
  lastSeenId?: string;
  hasMore: boolean;
}

interface PlatformPoller {
  poll(
    credentials: SocialCredentials,
    accountId: string,
    config: OrgFeedConfig,
    sinceId?: string,
  ): Promise<PollResult>;
}

import { TWITTER_API_BASE, twitterApiRequest } from "@/lib/utils/twitter-api";

class TwitterPoller implements PlatformPoller {
  async poll(
    credentials: SocialCredentials,
    accountId: string,
    config: OrgFeedConfig,
    sinceId?: string,
  ): Promise<PollResult> {
    if (!credentials.accessToken) {
      throw new Error("Twitter access token required");
    }

    const engagements: PolledEngagement[] = [];
    let lastSeenId = sinceId;
    let hasMore = false;

    if (config.monitor_mentions) {
      const mentions = await this.fetchMentions(
        credentials.accessToken,
        accountId,
        sinceId,
      );
      engagements.push(...mentions.engagements);
      if (mentions.lastSeenId) lastSeenId = mentions.lastSeenId;
      hasMore = hasMore || mentions.hasMore;
    }

    if (config.monitor_quote_tweets) {
      const quotes = await this.fetchQuoteTweets(
        credentials.accessToken,
        accountId,
        sinceId,
      );
      engagements.push(...quotes.engagements);
      if (
        quotes.lastSeenId &&
        (!lastSeenId || quotes.lastSeenId > lastSeenId)
      ) {
        lastSeenId = quotes.lastSeenId;
      }
      hasMore = hasMore || quotes.hasMore;
    }

    return { engagements, lastSeenId, hasMore };
  }

  private async fetchMentions(
    accessToken: string,
    userId: string,
    sinceId?: string,
  ): Promise<PollResult> {
    const params = new URLSearchParams({
      "tweet.fields":
        "author_id,created_at,public_metrics,referenced_tweets,entities",
      "user.fields": "username,name,profile_image_url,public_metrics,verified",
      expansions: "author_id,referenced_tweets.id",
      max_results: "100",
    });

    if (sinceId) {
      params.set("since_id", sinceId);
    }

    const data = await twitterApiRequest<{
      data?: TwitterTweet[];
      includes?: { users?: TwitterUser[]; tweets?: TwitterTweet[] };
      meta?: { next_token?: string; result_count?: number };
    }>(`/users/${userId}/mentions?${params}`, accessToken);
    const engagements: PolledEngagement[] = [];

    if (!data.data) {
      return { engagements, hasMore: false };
    }

    const users = new Map<string, TwitterUser>();
    for (const user of data.includes?.users ?? []) {
      users.set(user.id, user);
    }

    const referencedTweets = new Map<string, TwitterTweet>();
    for (const tweet of data.includes?.tweets ?? []) {
      referencedTweets.set(tweet.id, tweet);
    }

    for (const tweet of data.data) {
      const author = users.get(tweet.author_id);
      const referencedTweet = tweet.referenced_tweets?.find(
        (ref: { type: string; id: string }) => ref.type === "replied_to",
      );
      const originalTweet = referencedTweet
        ? referencedTweets.get(referencedTweet.id)
        : undefined;

      let eventType: SocialEngagementType = "mention";
      if (referencedTweet?.type === "replied_to") {
        eventType = "reply";
      } else if (referencedTweet?.type === "quoted") {
        eventType = "quote_tweet";
      }

      engagements.push({
        eventType,
        sourcePostId: tweet.id,
        sourcePostUrl: `https://twitter.com/i/status/${tweet.id}`,
        authorId: tweet.author_id,
        authorUsername: author?.username,
        authorDisplayName: author?.name,
        authorAvatarUrl: author?.profile_image_url,
        authorFollowerCount: author?.public_metrics?.followers_count,
        authorVerified: author?.verified,
        originalPostId: originalTweet?.id,
        originalPostUrl: originalTweet
          ? `https://twitter.com/i/status/${originalTweet.id}`
          : undefined,
        originalPostContent: originalTweet?.text,
        content: tweet.text,
        mediaUrls: undefined,
        rawData: tweet,
        engagementMetrics: {
          likes: tweet.public_metrics?.like_count,
          reposts: tweet.public_metrics?.retweet_count,
          replies: tweet.public_metrics?.reply_count,
          quotes: tweet.public_metrics?.quote_count,
        },
      });
    }

    const newestId = data.data[0]?.id;

    return {
      engagements,
      lastSeenId: newestId,
      hasMore: !!data.meta?.next_token,
    };
  }

  private async fetchQuoteTweets(
    accessToken: string,
    userId: string,
    sinceId?: string,
  ): Promise<PollResult> {
    // Twitter API v2 doesn't have a direct quote tweets endpoint for user
    // We'd need to search for quotes - simplified implementation
    const params = new URLSearchParams({
      query: `is:quote url:twitter.com/${userId}`,
      "tweet.fields": "author_id,created_at,public_metrics,referenced_tweets",
      "user.fields": "username,name,profile_image_url,public_metrics,verified",
      expansions: "author_id,referenced_tweets.id",
      max_results: "100",
    });

    if (sinceId) {
      params.set("since_id", sinceId);
    }

    try {
      const data = await twitterApiRequest<{
        data?: TwitterTweet[];
        includes?: { users?: TwitterUser[]; tweets?: TwitterTweet[] };
        meta?: { next_token?: string; result_count?: number };
      }>(`/tweets/search/recent?${params}`, accessToken);

      const engagements: PolledEngagement[] = [];

      if (!data.data) {
        return { engagements, hasMore: false };
      }

      const users = new Map<string, TwitterUser>();
      for (const user of data.includes?.users ?? []) {
        users.set(user.id, user);
      }

      const referencedTweets = new Map<string, TwitterTweet>();
      for (const tweet of data.includes?.tweets ?? []) {
        referencedTweets.set(tweet.id, tweet);
      }

      for (const tweet of data.data) {
        const author = users.get(tweet.author_id);
        const quotedRef = tweet.referenced_tweets?.find(
          (ref: { type: string; id: string }) => ref.type === "quoted",
        );
        const originalTweet = quotedRef
          ? referencedTweets.get(quotedRef.id)
          : undefined;

        engagements.push({
          eventType: "quote_tweet",
          sourcePostId: tweet.id,
          sourcePostUrl: `https://twitter.com/i/status/${tweet.id}`,
          authorId: tweet.author_id,
          authorUsername: author?.username,
          authorDisplayName: author?.name,
          authorAvatarUrl: author?.profile_image_url,
          authorFollowerCount: author?.public_metrics?.followers_count,
          authorVerified: author?.verified,
          originalPostId: originalTweet?.id,
          originalPostUrl: originalTweet
            ? `https://twitter.com/i/status/${originalTweet.id}`
            : undefined,
          originalPostContent: originalTweet?.text,
          content: tweet.text,
          rawData: tweet,
          engagementMetrics: {
            likes: tweet.public_metrics?.like_count,
            reposts: tweet.public_metrics?.retweet_count,
            replies: tweet.public_metrics?.reply_count,
            quotes: tweet.public_metrics?.quote_count,
          },
        });
      }

      return {
        engagements,
        lastSeenId: data.data[0]?.id,
        hasMore: !!data.meta?.next_token,
      };
    } catch (error) {
      // Search may not be available on all API tiers
      if (error instanceof Error && error.message.includes("403")) {
        logger.debug(
          "[Twitter Poller] Quote search not available on this API tier",
        );
        return { engagements: [], hasMore: false };
      }
      throw error;
    }
  }
}

interface TwitterUser {
  id: string;
  username: string;
  name: string;
  profile_image_url?: string;
  public_metrics?: {
    followers_count: number;
    following_count: number;
  };
  verified?: boolean;
}

interface TwitterTweet {
  id: string;
  text: string;
  author_id: string;
  public_metrics?: {
    like_count: number;
    retweet_count: number;
    reply_count: number;
    quote_count: number;
  };
  referenced_tweets?: Array<{ type: string; id: string }>;
  attachments?: { media_keys?: string[] };
}

class BlueskyPoller implements PlatformPoller {
  async poll(
    credentials: SocialCredentials,
    accountId: string,
    config: OrgFeedConfig,
    sinceId?: string,
  ): Promise<PollResult> {
    if (!credentials.handle || !credentials.appPassword) {
      throw new Error("Bluesky handle and app password required");
    }

    const session = await this.createSession(
      credentials.handle,
      credentials.appPassword,
    );
    const engagements: PolledEngagement[] = [];

    if (
      config.monitor_mentions ||
      config.monitor_replies ||
      config.monitor_quote_tweets
    ) {
      const notifications = await this.fetchNotifications(session, sinceId);

      for (const notif of notifications.notifications) {
        if (notif.reason === "mention" && !config.monitor_mentions) continue;
        if (notif.reason === "reply" && !config.monitor_replies) continue;
        if (notif.reason === "quote" && !config.monitor_quote_tweets) continue;
        if (notif.reason === "repost" && !config.monitor_reposts) continue;
        if (notif.reason === "like" && !config.monitor_likes) continue;

        engagements.push(this.mapNotificationToEngagement(notif));
      }

      return {
        engagements,
        lastSeenId: notifications.cursor,
        hasMore: !!notifications.cursor,
      };
    }

    return { engagements, hasMore: false };
  }

  private async createSession(
    handle: string,
    appPassword: string,
  ): Promise<{ accessJwt: string; did: string }> {
    const response = await fetch(
      "https://bsky.social/xrpc/com.atproto.server.createSession",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: handle, password: appPassword }),
      },
    );

    if (!response.ok) {
      throw new Error(`Bluesky auth failed: ${response.status}`);
    }

    return response.json();
  }

  private async fetchNotifications(
    session: { accessJwt: string; did: string },
    cursor?: string,
  ): Promise<{ notifications: BlueskyNotification[]; cursor?: string }> {
    const params = new URLSearchParams({ limit: "50" });
    if (cursor) params.set("cursor", cursor);

    const response = await fetch(
      `https://bsky.social/xrpc/app.bsky.notification.listNotifications?${params}`,
      {
        headers: { Authorization: `Bearer ${session.accessJwt}` },
      },
    );

    if (!response.ok) {
      throw new Error(`Bluesky notifications fetch failed: ${response.status}`);
    }

    const data = await response.json();
    return {
      notifications: data.notifications ?? [],
      cursor: data.cursor,
    };
  }

  private mapNotificationToEngagement(
    notif: BlueskyNotification,
  ): PolledEngagement {
    const eventTypeMap: Record<string, SocialEngagementType> = {
      mention: "mention",
      reply: "reply",
      quote: "quote_tweet",
      repost: "repost",
      like: "like",
      follow: "follow",
    };

    return {
      eventType: eventTypeMap[notif.reason] ?? "mention",
      sourcePostId: notif.uri,
      sourcePostUrl: this.uriToUrl(notif.uri),
      authorId: notif.author.did,
      authorUsername: notif.author.handle,
      authorDisplayName: notif.author.displayName,
      authorAvatarUrl: notif.author.avatar,
      content: notif.record?.text,
      rawData: notif as unknown as Record<string, unknown>,
    };
  }

  private uriToUrl(uri: string): string {
    const match = uri.match(/at:\/\/(.+)\/app\.bsky\.feed\.post\/(.+)/);
    if (match) {
      return `https://bsky.app/profile/${match[1]}/post/${match[2]}`;
    }
    return uri;
  }
}

interface BlueskyNotification {
  uri: string;
  cid: string;
  author: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  reason: string;
  record?: {
    text?: string;
  };
  indexedAt: string;
}

class RedditPoller implements PlatformPoller {
  async poll(
    credentials: SocialCredentials,
    accountId: string,
    config: OrgFeedConfig,
    sinceId?: string,
  ): Promise<PollResult> {
    if (!credentials.accessToken) {
      throw new Error("Reddit access token required");
    }

    const engagements: PolledEngagement[] = [];

    if (config.monitor_mentions || config.monitor_replies) {
      const messages = await this.fetchInbox(credentials.accessToken, sinceId);
      engagements.push(...messages.engagements);

      return {
        engagements,
        lastSeenId: messages.lastSeenId,
        hasMore: messages.hasMore,
      };
    }

    return { engagements, hasMore: false };
  }

  private async fetchInbox(
    accessToken: string,
    after?: string,
  ): Promise<PollResult> {
    const params = new URLSearchParams({ limit: "100" });
    if (after) params.set("after", after);

    const response = await fetch(
      `https://oauth.reddit.com/message/inbox?${params}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": "ElizaCloud/1.0",
        },
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Reddit inbox fetch failed: ${response.status} - ${error}`,
      );
    }

    const data = await response.json();
    const engagements: PolledEngagement[] = [];

    for (const child of data.data?.children ?? []) {
      const item = child.data;

      let eventType: SocialEngagementType = "mention";
      if (item.was_comment) {
        eventType = "reply";
      } else if (item.subject?.includes("mention")) {
        eventType = "mention";
      }

      engagements.push({
        eventType,
        sourcePostId: item.name ?? item.id,
        sourcePostUrl: item.context
          ? `https://reddit.com${item.context}`
          : undefined,
        authorId: item.author,
        authorUsername: item.author,
        content: item.body,
        rawData: item,
      });
    }

    return {
      engagements,
      lastSeenId: data.data?.after,
      hasMore: !!data.data?.after,
    };
  }
}

class MastodonPoller implements PlatformPoller {
  async poll(
    credentials: SocialCredentials,
    accountId: string,
    config: OrgFeedConfig,
    sinceId?: string,
  ): Promise<PollResult> {
    if (!credentials.accessToken) {
      throw new Error("Mastodon access token required");
    }

    const instanceUrl =
      credentials.instanceUrl ??
      credentials.webhookUrl ??
      "https://mastodon.social";
    const engagements: PolledEngagement[] = [];

    const notifications = await this.fetchNotifications(
      instanceUrl.replace(/\/$/, ""),
      credentials.accessToken,
      config,
      sinceId,
    );

    engagements.push(...notifications.engagements);

    return {
      engagements,
      lastSeenId: notifications.lastSeenId,
      hasMore: notifications.hasMore,
    };
  }

  private async fetchNotifications(
    instanceUrl: string,
    accessToken: string,
    config: OrgFeedConfig,
    sinceId?: string,
  ): Promise<PollResult> {
    const params = new URLSearchParams({ limit: "40" });
    if (sinceId) params.set("since_id", sinceId);

    const types: string[] = [];
    if (config.monitor_mentions) types.push("mention");
    if (config.monitor_replies) types.push("mention"); // Mastodon treats replies as mentions
    if (config.monitor_reposts) types.push("reblog");
    if (config.monitor_likes) types.push("favourite");

    for (const type of types) {
      params.append("types[]", type);
    }

    const response = await fetch(
      `${instanceUrl}/api/v1/notifications?${params}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Mastodon notifications fetch failed: ${response.status} - ${error}`,
      );
    }

    const notifications: MastodonNotification[] = await response.json();
    const engagements: PolledEngagement[] = [];

    const eventTypeMap: Record<string, SocialEngagementType> = {
      mention: "mention",
      reblog: "repost",
      favourite: "like",
      follow: "follow",
    };

    for (const notif of notifications) {
      engagements.push({
        eventType: eventTypeMap[notif.type] ?? "mention",
        sourcePostId: notif.status?.id ?? notif.id,
        sourcePostUrl: notif.status?.url,
        authorId: notif.account.id,
        authorUsername: notif.account.acct,
        authorDisplayName: notif.account.display_name,
        authorAvatarUrl: notif.account.avatar,
        authorFollowerCount: notif.account.followers_count,
        content: notif.status?.content,
        rawData: notif as unknown as Record<string, unknown>,
      });
    }

    const newestId = notifications[0]?.id;

    return {
      engagements,
      lastSeenId: newestId,
      hasMore: notifications.length >= 40,
    };
  }
}

interface MastodonNotification {
  id: string;
  type: string;
  created_at: string;
  account: {
    id: string;
    acct: string;
    display_name: string;
    avatar: string;
    followers_count?: number;
  };
  status?: {
    id: string;
    url: string;
    content: string;
  };
}

const pollers: Partial<Record<SocialPlatform, PlatformPoller>> = {
  twitter: new TwitterPoller(),
  bluesky: new BlueskyPoller(),
  reddit: new RedditPoller(),
  mastodon: new MastodonPoller(),
};

class FeedPollingService {
  async pollFeed(
    config: OrgFeedConfig,
  ): Promise<{ newEngagements: number; errors: string[] }> {
    const errors: string[] = [];
    let newEngagements = 0;

    logger.info("[FeedPoller] Polling feed", {
      configId: config.id,
      platform: config.source_platform,
      accountId: config.source_account_id,
    });

    // Mark as polling immediately to prevent concurrent execution
    await feedConfigService.updatePollingState(config.id, {
      lastPolledAt: new Date(),
      errorCount: config.poll_error_count ?? 0,
    });

    const poller = pollers[config.source_platform as SocialPlatform];
    if (!poller) {
      const error = `No poller for platform: ${config.source_platform}`;
      logger.warn(`[FeedPoller] ${error}`);
      await feedConfigService.updatePollingState(config.id, {
        lastPolledAt: new Date(),
        errorCount: (config.poll_error_count ?? 0) + 1,
        lastError: error,
      });
      return { newEngagements: 0, errors: [error] };
    }

    const credentials = await this.getCredentials(config);
    if (!credentials) {
      const error = "No valid credentials for feed";
      logger.warn(`[FeedPoller] ${error}`, { configId: config.id });
      await feedConfigService.updatePollingState(config.id, {
        lastPolledAt: new Date(),
        errorCount: (config.poll_error_count ?? 0) + 1,
        lastError: error,
      });
      return { newEngagements: 0, errors: [error] };
    }

    try {
      const result = await poller.poll(
        credentials,
        config.source_account_id,
        config,
        config.last_seen_id ?? undefined,
      );

      for (const engagement of result.engagements) {
        const exists = await engagementEventService.exists(
          config.id,
          engagement.sourcePostId,
        );
        if (exists) continue;

        if (!this.passesFilters(engagement, config)) continue;

        await engagementEventService.create({
          organizationId: config.organization_id,
          feedConfigId: config.id,
          eventType: engagement.eventType,
          sourcePlatform: config.source_platform,
          sourcePostId: engagement.sourcePostId,
          sourcePostUrl: engagement.sourcePostUrl,
          authorId: engagement.authorId,
          authorUsername: engagement.authorUsername,
          authorDisplayName: engagement.authorDisplayName,
          authorAvatarUrl: engagement.authorAvatarUrl,
          authorFollowerCount: engagement.authorFollowerCount,
          authorVerified: engagement.authorVerified,
          originalPostId: engagement.originalPostId,
          originalPostUrl: engagement.originalPostUrl,
          originalPostContent: engagement.originalPostContent,
          content: engagement.content,
          contentHtml: engagement.contentHtml,
          mediaUrls: engagement.mediaUrls,
          rawData: engagement.rawData,
          engagementMetrics: engagement.engagementMetrics,
        });
        newEngagements++;
      }

      await feedConfigService.updatePollingState(config.id, {
        lastPolledAt: new Date(),
        lastSeenId: result.lastSeenId,
        errorCount: 0,
        lastError: null,
      });

      logger.info("[FeedPoller] Poll complete", {
        configId: config.id,
        newEngagements,
        totalPolled: result.engagements.length,
      });
    } catch (error) {
      const errorMessage = extractErrorMessage(error);
      logger.error("[FeedPoller] Poll failed", {
        configId: config.id,
        error: errorMessage,
      });
      errors.push(errorMessage);

      await feedConfigService.updatePollingState(config.id, {
        lastPolledAt: new Date(),
        errorCount: (config.poll_error_count ?? 0) + 1,
        lastError: errorMessage,
      });
    }

    return { newEngagements, errors };
  }

  async pollDueFeeds(): Promise<{
    feedsPolled: number;
    totalNewEngagements: number;
    errors: Array<{ configId: string; error: string }>;
  }> {
    const feeds = await feedConfigService.getFeedsDueForPolling(10);

    logger.info("[FeedPoller] Polling due feeds", { count: feeds.length });

    let totalNewEngagements = 0;
    const errors: Array<{ configId: string; error: string }> = [];

    for (const feed of feeds) {
      const result = await this.pollFeed(feed);
      totalNewEngagements += result.newEngagements;
      for (const error of result.errors) {
        errors.push({ configId: feed.id, error });
      }
    }

    return {
      feedsPolled: feeds.length,
      totalNewEngagements,
      errors,
    };
  }

  private async getCredentials(
    config: OrgFeedConfig,
  ): Promise<SocialCredentials | null> {
    return socialMediaService.getCredentialsForPlatform(
      config.organization_id,
      config.source_platform as SocialPlatform,
      config.credential_id ?? undefined,
    );
  }

  private passesFilters(
    engagement: PolledEngagement,
    config: OrgFeedConfig,
  ): boolean {
    if (
      config.min_follower_count !== null &&
      config.min_follower_count !== undefined
    ) {
      if (
        !engagement.authorFollowerCount ||
        engagement.authorFollowerCount < config.min_follower_count
      ) {
        return false;
      }
    }

    const keywords = config.filter_keywords ?? [];
    if (keywords.length > 0 && engagement.content) {
      const contentLower = engagement.content.toLowerCase();
      const hasMatch = keywords.some((kw) =>
        contentLower.includes(kw.toLowerCase()),
      );

      if (config.filter_mode === "include" && !hasMatch) {
        return false;
      }
      if (config.filter_mode === "exclude" && hasMatch) {
        return false;
      }
    }

    return true;
  }
}

export const feedPollingService = new FeedPollingService();

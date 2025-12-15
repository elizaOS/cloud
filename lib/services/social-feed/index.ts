import { and, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  orgFeedConfigs,
  socialEngagementEvents,
  pendingReplyConfirmations,
  socialNotificationMessages,
  type OrgFeedConfig,
  type NewOrgFeedConfig,
  type SocialEngagementEvent,
  type PendingReplyConfirmation,
  type SocialNotificationMessage,
  type NotificationChannel,
  type SocialEngagementType,
  type ReplyConfirmationStatus,
} from "@/db/schemas/social-feed";
import { logger } from "@/lib/utils/logger";

export interface CreateFeedConfigParams {
  organizationId: string;
  sourcePlatform: string;
  sourceAccountId: string;
  sourceUsername?: string;
  credentialId?: string;
  monitorMentions?: boolean;
  monitorReplies?: boolean;
  monitorQuoteTweets?: boolean;
  monitorReposts?: boolean;
  monitorLikes?: boolean;
  notificationChannels: NotificationChannel[];
  pollingIntervalSeconds?: number;
  minFollowerCount?: number;
  filterKeywords?: string[];
  filterMode?: "include" | "exclude";
  createdBy?: string;
}

export interface UpdateFeedConfigParams {
  sourceUsername?: string;
  credentialId?: string | null;
  monitorMentions?: boolean;
  monitorReplies?: boolean;
  monitorQuoteTweets?: boolean;
  monitorReposts?: boolean;
  monitorLikes?: boolean;
  notificationChannels?: NotificationChannel[];
  enabled?: boolean;
  pollingIntervalSeconds?: number;
  minFollowerCount?: number | null;
  filterKeywords?: string[];
  filterMode?: "include" | "exclude";
}

export interface ListFeedConfigsParams {
  organizationId: string;
  sourcePlatform?: string;
  enabled?: boolean;
  limit?: number;
  offset?: number;
}

export interface CreateEngagementEventParams {
  organizationId: string;
  feedConfigId: string;
  eventType: SocialEngagementType;
  sourcePlatform: string;
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

export interface ListEngagementEventsParams {
  organizationId: string;
  feedConfigId?: string;
  eventType?: SocialEngagementType | SocialEngagementType[];
  authorId?: string;
  since?: Date;
  until?: Date;
  notificationSent?: boolean;
  limit?: number;
  offset?: number;
}

export interface CreateReplyConfirmationParams {
  organizationId: string;
  engagementEventId?: string;
  targetPlatform: string;
  targetPostId: string;
  targetPostUrl?: string;
  sourcePlatform: string;
  sourceChannelId: string;
  sourceServerId?: string;
  sourceMessageId: string;
  sourceUserId: string;
  sourceUsername?: string;
  sourceUserDisplayName?: string;
  replyContent: string;
  replyMediaUrls?: string[];
  expiresAt: Date;
}

export interface ListReplyConfirmationsParams {
  organizationId: string;
  status?: ReplyConfirmationStatus | ReplyConfirmationStatus[];
  sourcePlatform?: string;
  engagementEventId?: string;
  limit?: number;
  offset?: number;
}

class FeedConfigService {
  async create(params: CreateFeedConfigParams): Promise<OrgFeedConfig> {
    logger.info("[SocialFeed] Creating feed config", {
      organizationId: params.organizationId,
      platform: params.sourcePlatform,
    });

    const [config] = await db
      .insert(orgFeedConfigs)
      .values({
        organization_id: params.organizationId,
        source_platform: params.sourcePlatform,
        source_account_id: params.sourceAccountId,
        source_username: params.sourceUsername,
        credential_id: params.credentialId,
        monitor_mentions: params.monitorMentions ?? true,
        monitor_replies: params.monitorReplies ?? true,
        monitor_quote_tweets: params.monitorQuoteTweets ?? true,
        monitor_reposts: params.monitorReposts ?? false,
        monitor_likes: params.monitorLikes ?? false,
        notification_channels: params.notificationChannels,
        polling_interval_seconds: params.pollingIntervalSeconds ?? 60,
        min_follower_count: params.minFollowerCount,
        filter_keywords: params.filterKeywords ?? [],
        filter_mode: params.filterMode ?? "include",
        created_by: params.createdBy,
      })
      .returning();

    return config;
  }

  async get(
    configId: string,
    organizationId: string,
  ): Promise<OrgFeedConfig | null> {
    const [config] = await db
      .select()
      .from(orgFeedConfigs)
      .where(
        and(
          eq(orgFeedConfigs.id, configId),
          eq(orgFeedConfigs.organization_id, organizationId),
        ),
      )
      .limit(1);

    return config ?? null;
  }

  async getBySourceAccount(
    organizationId: string,
    sourcePlatform: string,
    sourceAccountId: string,
  ): Promise<OrgFeedConfig | null> {
    const [config] = await db
      .select()
      .from(orgFeedConfigs)
      .where(
        and(
          eq(orgFeedConfigs.organization_id, organizationId),
          eq(orgFeedConfigs.source_platform, sourcePlatform),
          eq(orgFeedConfigs.source_account_id, sourceAccountId),
        ),
      )
      .limit(1);

    return config ?? null;
  }

  async update(
    configId: string,
    organizationId: string,
    params: UpdateFeedConfigParams,
  ): Promise<OrgFeedConfig> {
    const updates: Partial<NewOrgFeedConfig> = { updated_at: new Date() };

    if (params.sourceUsername !== undefined)
      updates.source_username = params.sourceUsername;
    if (params.credentialId !== undefined)
      updates.credential_id = params.credentialId;
    if (params.monitorMentions !== undefined)
      updates.monitor_mentions = params.monitorMentions;
    if (params.monitorReplies !== undefined)
      updates.monitor_replies = params.monitorReplies;
    if (params.monitorQuoteTweets !== undefined)
      updates.monitor_quote_tweets = params.monitorQuoteTweets;
    if (params.monitorReposts !== undefined)
      updates.monitor_reposts = params.monitorReposts;
    if (params.monitorLikes !== undefined)
      updates.monitor_likes = params.monitorLikes;
    if (params.notificationChannels !== undefined)
      updates.notification_channels = params.notificationChannels;
    if (params.enabled !== undefined) updates.enabled = params.enabled;
    if (params.pollingIntervalSeconds !== undefined)
      updates.polling_interval_seconds = params.pollingIntervalSeconds;
    if (params.minFollowerCount !== undefined)
      updates.min_follower_count = params.minFollowerCount;
    if (params.filterKeywords !== undefined)
      updates.filter_keywords = params.filterKeywords;
    if (params.filterMode !== undefined)
      updates.filter_mode = params.filterMode;

    const [config] = await db
      .update(orgFeedConfigs)
      .set(updates)
      .where(
        and(
          eq(orgFeedConfigs.id, configId),
          eq(orgFeedConfigs.organization_id, organizationId),
        ),
      )
      .returning();

    if (!config) throw new Error("Feed config not found");
    return config;
  }

  async delete(configId: string, organizationId: string): Promise<void> {
    await db
      .delete(orgFeedConfigs)
      .where(
        and(
          eq(orgFeedConfigs.id, configId),
          eq(orgFeedConfigs.organization_id, organizationId),
        ),
      );
  }

  async list(
    params: ListFeedConfigsParams,
  ): Promise<{ configs: OrgFeedConfig[]; total: number }> {
    const conditions = [
      eq(orgFeedConfigs.organization_id, params.organizationId),
    ];
    if (params.sourcePlatform)
      conditions.push(
        eq(orgFeedConfigs.source_platform, params.sourcePlatform),
      );
    if (params.enabled !== undefined)
      conditions.push(eq(orgFeedConfigs.enabled, params.enabled));

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(orgFeedConfigs)
      .where(and(...conditions));

    const configs = await db
      .select()
      .from(orgFeedConfigs)
      .where(and(...conditions))
      .orderBy(desc(orgFeedConfigs.created_at))
      .limit(params.limit ?? 50)
      .offset(params.offset ?? 0);

    return { configs, total: Number(countResult?.count ?? 0) };
  }

  async getFeedsDueForPolling(
    limit = 10,
    maxErrorCount = 5,
  ): Promise<OrgFeedConfig[]> {
    const now = new Date();
    return db
      .select()
      .from(orgFeedConfigs)
      .where(
        and(
          eq(orgFeedConfigs.enabled, true),
          lt(orgFeedConfigs.poll_error_count, maxErrorCount), // Circuit breaker: skip feeds with too many errors
          or(
            isNull(orgFeedConfigs.last_polled_at),
            sql`${orgFeedConfigs.last_polled_at} + (${orgFeedConfigs.polling_interval_seconds} || ' seconds')::interval < ${now}`,
          ),
        ),
      )
      .orderBy(orgFeedConfigs.last_polled_at)
      .limit(limit);
  }

  async resetErrorCount(configId: string): Promise<void> {
    await db
      .update(orgFeedConfigs)
      .set({
        poll_error_count: 0,
        last_poll_error: null,
        updated_at: new Date(),
      })
      .where(eq(orgFeedConfigs.id, configId));
  }

  async updatePollingState(
    configId: string,
    state: {
      lastPolledAt: Date;
      lastSeenId?: string;
      errorCount?: number;
      lastError?: string | null;
    },
  ): Promise<void> {
    await db
      .update(orgFeedConfigs)
      .set({
        last_polled_at: state.lastPolledAt,
        last_seen_id: state.lastSeenId,
        poll_error_count: state.errorCount ?? 0,
        last_poll_error: state.lastError,
        updated_at: new Date(),
      })
      .where(eq(orgFeedConfigs.id, configId));
  }
}

class EngagementEventService {
  async create(
    params: CreateEngagementEventParams,
  ): Promise<SocialEngagementEvent> {
    logger.info("[SocialFeed] Recording engagement", {
      organizationId: params.organizationId,
      type: params.eventType,
      platform: params.sourcePlatform,
    });

    const [event] = await db
      .insert(socialEngagementEvents)
      .values({
        organization_id: params.organizationId,
        feed_config_id: params.feedConfigId,
        event_type: params.eventType,
        source_platform: params.sourcePlatform,
        source_post_id: params.sourcePostId,
        source_post_url: params.sourcePostUrl,
        author_id: params.authorId,
        author_username: params.authorUsername,
        author_display_name: params.authorDisplayName,
        author_avatar_url: params.authorAvatarUrl,
        author_follower_count: params.authorFollowerCount,
        author_verified: params.authorVerified,
        original_post_id: params.originalPostId,
        original_post_url: params.originalPostUrl,
        original_post_content: params.originalPostContent,
        content: params.content,
        content_html: params.contentHtml,
        media_urls: params.mediaUrls ?? [],
        raw_data: params.rawData,
        engagement_metrics: params.engagementMetrics,
        processed_at: new Date(),
      })
      .onConflictDoNothing()
      .returning();

    return event;
  }

  async get(
    eventId: string,
    organizationId: string,
  ): Promise<SocialEngagementEvent | null> {
    const [event] = await db
      .select()
      .from(socialEngagementEvents)
      .where(
        and(
          eq(socialEngagementEvents.id, eventId),
          eq(socialEngagementEvents.organization_id, organizationId),
        ),
      )
      .limit(1);

    return event ?? null;
  }

  async exists(feedConfigId: string, sourcePostId: string): Promise<boolean> {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(socialEngagementEvents)
      .where(
        and(
          eq(socialEngagementEvents.feed_config_id, feedConfigId),
          eq(socialEngagementEvents.source_post_id, sourcePostId),
        ),
      );

    return Number(result?.count ?? 0) > 0;
  }

  async list(
    params: ListEngagementEventsParams,
  ): Promise<{ events: SocialEngagementEvent[]; total: number }> {
    const conditions = [
      eq(socialEngagementEvents.organization_id, params.organizationId),
    ];

    if (params.feedConfigId)
      conditions.push(
        eq(socialEngagementEvents.feed_config_id, params.feedConfigId),
      );
    if (params.eventType) {
      if (Array.isArray(params.eventType)) {
        conditions.push(
          inArray(socialEngagementEvents.event_type, params.eventType),
        );
      } else {
        conditions.push(
          eq(socialEngagementEvents.event_type, params.eventType),
        );
      }
    }
    if (params.authorId)
      conditions.push(eq(socialEngagementEvents.author_id, params.authorId));
    if (params.since)
      conditions.push(gte(socialEngagementEvents.created_at, params.since));
    if (params.until)
      conditions.push(lt(socialEngagementEvents.created_at, params.until));
    if (params.notificationSent !== undefined) {
      if (params.notificationSent) {
        conditions.push(
          sql`${socialEngagementEvents.notification_sent_at} IS NOT NULL`,
        );
      } else {
        conditions.push(isNull(socialEngagementEvents.notification_sent_at));
      }
    }

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(socialEngagementEvents)
      .where(and(...conditions));

    const events = await db
      .select()
      .from(socialEngagementEvents)
      .where(and(...conditions))
      .orderBy(desc(socialEngagementEvents.created_at))
      .limit(params.limit ?? 50)
      .offset(params.offset ?? 0);

    return { events, total: Number(countResult?.count ?? 0) };
  }

  async markNotificationSent(
    eventId: string,
    channelIds: string[],
    messageIds: Record<string, string>,
  ): Promise<void> {
    await db
      .update(socialEngagementEvents)
      .set({
        notification_sent_at: new Date(),
        notification_channel_ids: channelIds,
        notification_message_ids: messageIds,
      })
      .where(eq(socialEngagementEvents.id, eventId));
  }

  async getUnnotifiedEvents(limit = 50): Promise<SocialEngagementEvent[]> {
    return db
      .select()
      .from(socialEngagementEvents)
      .where(isNull(socialEngagementEvents.notification_sent_at))
      .orderBy(socialEngagementEvents.created_at)
      .limit(limit);
  }
}

class ReplyConfirmationService {
  async create(
    params: CreateReplyConfirmationParams,
  ): Promise<PendingReplyConfirmation> {
    logger.info("[SocialFeed] Creating reply confirmation", {
      organizationId: params.organizationId,
      targetPlatform: params.targetPlatform,
    });

    const [confirmation] = await db
      .insert(pendingReplyConfirmations)
      .values({
        organization_id: params.organizationId,
        engagement_event_id: params.engagementEventId,
        target_platform: params.targetPlatform,
        target_post_id: params.targetPostId,
        target_post_url: params.targetPostUrl,
        source_platform: params.sourcePlatform,
        source_channel_id: params.sourceChannelId,
        source_server_id: params.sourceServerId,
        source_message_id: params.sourceMessageId,
        source_user_id: params.sourceUserId,
        source_username: params.sourceUsername,
        source_user_display_name: params.sourceUserDisplayName,
        reply_content: params.replyContent,
        reply_media_urls: params.replyMediaUrls ?? [],
        expires_at: params.expiresAt,
      })
      .returning();

    return confirmation;
  }

  async get(
    confirmationId: string,
    organizationId: string,
  ): Promise<PendingReplyConfirmation | null> {
    const [confirmation] = await db
      .select()
      .from(pendingReplyConfirmations)
      .where(
        and(
          eq(pendingReplyConfirmations.id, confirmationId),
          eq(pendingReplyConfirmations.organization_id, organizationId),
        ),
      )
      .limit(1);

    return confirmation ?? null;
  }

  async getBySourceMessage(
    sourcePlatform: string,
    sourceChannelId: string,
    sourceMessageId: string,
  ): Promise<PendingReplyConfirmation | null> {
    const [confirmation] = await db
      .select()
      .from(pendingReplyConfirmations)
      .where(
        and(
          eq(pendingReplyConfirmations.source_platform, sourcePlatform),
          eq(pendingReplyConfirmations.source_channel_id, sourceChannelId),
          eq(pendingReplyConfirmations.source_message_id, sourceMessageId),
        ),
      )
      .limit(1);

    return confirmation ?? null;
  }

  async getByConfirmationMessage(
    confirmationMessageId: string,
  ): Promise<PendingReplyConfirmation | null> {
    const [confirmation] = await db
      .select()
      .from(pendingReplyConfirmations)
      .where(
        eq(
          pendingReplyConfirmations.confirmation_message_id,
          confirmationMessageId,
        ),
      )
      .limit(1);

    return confirmation ?? null;
  }

  async list(
    params: ListReplyConfirmationsParams,
  ): Promise<{ confirmations: PendingReplyConfirmation[]; total: number }> {
    const conditions = [
      eq(pendingReplyConfirmations.organization_id, params.organizationId),
    ];

    if (params.status) {
      if (Array.isArray(params.status)) {
        conditions.push(
          inArray(pendingReplyConfirmations.status, params.status),
        );
      } else {
        conditions.push(eq(pendingReplyConfirmations.status, params.status));
      }
    }
    if (params.sourcePlatform)
      conditions.push(
        eq(pendingReplyConfirmations.source_platform, params.sourcePlatform),
      );
    if (params.engagementEventId)
      conditions.push(
        eq(
          pendingReplyConfirmations.engagement_event_id,
          params.engagementEventId,
        ),
      );

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(pendingReplyConfirmations)
      .where(and(...conditions));

    const confirmations = await db
      .select()
      .from(pendingReplyConfirmations)
      .where(and(...conditions))
      .orderBy(desc(pendingReplyConfirmations.created_at))
      .limit(params.limit ?? 50)
      .offset(params.offset ?? 0);

    return { confirmations, total: Number(countResult?.count ?? 0) };
  }

  async setConfirmationMessage(
    confirmationId: string,
    messageId: string,
    channelId: string,
  ): Promise<void> {
    await db
      .update(pendingReplyConfirmations)
      .set({
        confirmation_message_id: messageId,
        confirmation_channel_id: channelId,
        updated_at: new Date(),
      })
      .where(eq(pendingReplyConfirmations.id, confirmationId));
  }

  async confirm(
    confirmationId: string,
    organizationId: string,
    confirmedByUserId: string,
    confirmedByUsername?: string,
  ): Promise<PendingReplyConfirmation> {
    const [confirmation] = await db
      .update(pendingReplyConfirmations)
      .set({
        status: "confirmed",
        confirmed_by_user_id: confirmedByUserId,
        confirmed_by_username: confirmedByUsername,
        confirmed_at: new Date(),
        updated_at: new Date(),
      })
      .where(
        and(
          eq(pendingReplyConfirmations.id, confirmationId),
          eq(pendingReplyConfirmations.organization_id, organizationId),
          eq(pendingReplyConfirmations.status, "pending"),
        ),
      )
      .returning();

    if (!confirmation) throw new Error("Confirmation not found or not pending");
    return confirmation;
  }

  async reject(
    confirmationId: string,
    organizationId: string,
    rejectedByUserId: string,
    reason?: string,
  ): Promise<PendingReplyConfirmation> {
    const [confirmation] = await db
      .update(pendingReplyConfirmations)
      .set({
        status: "rejected",
        confirmed_by_user_id: rejectedByUserId,
        confirmed_at: new Date(),
        rejection_reason: reason,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(pendingReplyConfirmations.id, confirmationId),
          eq(pendingReplyConfirmations.organization_id, organizationId),
          eq(pendingReplyConfirmations.status, "pending"),
        ),
      )
      .returning();

    if (!confirmation) throw new Error("Confirmation not found or not pending");
    return confirmation;
  }

  async markSent(
    confirmationId: string,
    sentPostId: string,
    sentPostUrl?: string,
  ): Promise<void> {
    await db
      .update(pendingReplyConfirmations)
      .set({
        status: "sent",
        sent_post_id: sentPostId,
        sent_post_url: sentPostUrl,
        sent_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(pendingReplyConfirmations.id, confirmationId));
  }

  async markFailed(
    confirmationId: string,
    errorMessage: string,
  ): Promise<void> {
    await db
      .update(pendingReplyConfirmations)
      .set({
        status: "failed",
        error_message: errorMessage,
        retry_count: sql`${pendingReplyConfirmations.retry_count} + 1`,
        updated_at: new Date(),
      })
      .where(eq(pendingReplyConfirmations.id, confirmationId));
  }

  async expirePending(): Promise<number> {
    const now = new Date();
    const result = await db
      .update(pendingReplyConfirmations)
      .set({ status: "expired", updated_at: now })
      .where(
        and(
          eq(pendingReplyConfirmations.status, "pending"),
          lt(pendingReplyConfirmations.expires_at, now),
        ),
      );

    return result.rowCount ?? 0;
  }

  async getPendingForExpiry(limit = 100): Promise<PendingReplyConfirmation[]> {
    const now = new Date();
    return db
      .select()
      .from(pendingReplyConfirmations)
      .where(
        and(
          eq(pendingReplyConfirmations.status, "pending"),
          lt(pendingReplyConfirmations.expires_at, now),
        ),
      )
      .limit(limit);
  }
}

class NotificationMessageService {
  async create(
    organizationId: string,
    engagementEventId: string,
    platform: string,
    channelId: string,
    messageId: string,
    serverId?: string,
    threadId?: string,
  ): Promise<SocialNotificationMessage> {
    const [message] = await db
      .insert(socialNotificationMessages)
      .values({
        organization_id: organizationId,
        engagement_event_id: engagementEventId,
        platform,
        channel_id: channelId,
        server_id: serverId,
        message_id: messageId,
        thread_id: threadId,
      })
      .onConflictDoNothing()
      .returning();

    return message;
  }

  async findEngagementByMessage(
    platform: string,
    channelId: string,
    messageId: string,
  ): Promise<{
    notification: SocialNotificationMessage;
    event: SocialEngagementEvent;
  } | null> {
    const [result] = await db
      .select()
      .from(socialNotificationMessages)
      .innerJoin(
        socialEngagementEvents,
        eq(
          socialNotificationMessages.engagement_event_id,
          socialEngagementEvents.id,
        ),
      )
      .where(
        and(
          eq(socialNotificationMessages.platform, platform),
          eq(socialNotificationMessages.channel_id, channelId),
          eq(socialNotificationMessages.message_id, messageId),
        ),
      )
      .limit(1);

    if (!result) return null;
    return {
      notification: result.social_notification_messages,
      event: result.social_engagement_events,
    };
  }

  async getForEngagement(
    engagementEventId: string,
  ): Promise<SocialNotificationMessage[]> {
    return db
      .select()
      .from(socialNotificationMessages)
      .where(
        eq(socialNotificationMessages.engagement_event_id, engagementEventId),
      );
  }
}

export const feedConfigService = new FeedConfigService();
export const engagementEventService = new EngagementEventService();
export const replyConfirmationService = new ReplyConfirmationService();
export const notificationMessageService = new NotificationMessageService();

export type {
  OrgFeedConfig,
  SocialEngagementEvent,
  PendingReplyConfirmation,
  SocialNotificationMessage,
  NotificationChannel,
  SocialEngagementType,
  ReplyConfirmationStatus,
};

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { feedConfigService, type NotificationChannel } from "@/lib/services/social-feed";
import { logger } from "@/lib/utils/logger";

const CreateFeedConfigSchema = z.object({
  sourcePlatform: z.string(),
  sourceAccountId: z.string(),
  sourceUsername: z.string().optional(),
  credentialId: z.string().uuid().optional(),
  monitorMentions: z.boolean().optional().default(true),
  monitorReplies: z.boolean().optional().default(true),
  monitorQuoteTweets: z.boolean().optional().default(true),
  monitorReposts: z.boolean().optional().default(false),
  monitorLikes: z.boolean().optional().default(false),
  notificationChannels: z.array(z.object({
    platform: z.enum(["discord", "telegram", "slack"]),
    channelId: z.string(),
    serverId: z.string().optional(),
    connectionId: z.string().optional(),
  })),
  pollingIntervalSeconds: z.number().optional().default(60),
  minFollowerCount: z.number().optional(),
  filterKeywords: z.array(z.string()).optional(),
  filterMode: z.enum(["include", "exclude"]).optional(),
});

const ListFeedsQuerySchema = z.object({
  sourcePlatform: z.string().optional(),
  enabled: z.string().optional().transform((v) => v === "true" ? true : v === "false" ? false : undefined),
  limit: z.string().optional().transform((v) => v ? parseInt(v, 10) : 50),
  offset: z.string().optional().transform((v) => v ? parseInt(v, 10) : 0),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = Object.fromEntries(request.nextUrl.searchParams);
  const params = ListFeedsQuerySchema.parse(searchParams);

  const { configs, total } = await feedConfigService.list({
    organizationId: user.organization_id,
    sourcePlatform: params.sourcePlatform,
    enabled: params.enabled,
    limit: params.limit,
    offset: params.offset,
  });

  return NextResponse.json({
    success: true,
    data: configs.map((c) => ({
      id: c.id,
      sourcePlatform: c.source_platform,
      sourceAccountId: c.source_account_id,
      sourceUsername: c.source_username,
      enabled: c.enabled,
      monitorMentions: c.monitor_mentions,
      monitorReplies: c.monitor_replies,
      monitorQuoteTweets: c.monitor_quote_tweets,
      monitorReposts: c.monitor_reposts,
      monitorLikes: c.monitor_likes,
      notificationChannels: c.notification_channels,
      pollingIntervalSeconds: c.polling_interval_seconds,
      minFollowerCount: c.min_follower_count,
      filterKeywords: c.filter_keywords,
      filterMode: c.filter_mode,
      lastPolledAt: c.last_polled_at,
      pollErrorCount: c.poll_error_count,
      lastPollError: c.last_poll_error,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    })),
    total,
    limit: params.limit,
    offset: params.offset,
  });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const params = CreateFeedConfigSchema.parse(body);

  logger.info("[API] Creating feed config", {
    organizationId: user.organization_id,
    platform: params.sourcePlatform,
  });

  const config = await feedConfigService.create({
    organizationId: user.organization_id,
    sourcePlatform: params.sourcePlatform,
    sourceAccountId: params.sourceAccountId,
    sourceUsername: params.sourceUsername,
    credentialId: params.credentialId,
    monitorMentions: params.monitorMentions,
    monitorReplies: params.monitorReplies,
    monitorQuoteTweets: params.monitorQuoteTweets,
    monitorReposts: params.monitorReposts,
    monitorLikes: params.monitorLikes,
    notificationChannels: params.notificationChannels as NotificationChannel[],
    pollingIntervalSeconds: params.pollingIntervalSeconds,
    minFollowerCount: params.minFollowerCount,
    filterKeywords: params.filterKeywords,
    filterMode: params.filterMode,
    createdBy: user.id,
  });

  return NextResponse.json({
    success: true,
    data: {
      id: config.id,
      sourcePlatform: config.source_platform,
      sourceAccountId: config.source_account_id,
      enabled: config.enabled,
      createdAt: config.created_at,
    },
  }, { status: 201 });
}

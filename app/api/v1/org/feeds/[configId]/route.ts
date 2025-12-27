import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import {
  feedConfigService,
  type NotificationChannel,
} from "@/lib/services/social-feed";
import { logger } from "@/lib/utils/logger";

const UpdateFeedConfigSchema = z.object({
  sourceUsername: z.string().optional(),
  credentialId: z.string().uuid().nullable().optional(),
  enabled: z.boolean().optional(),
  monitorMentions: z.boolean().optional(),
  monitorReplies: z.boolean().optional(),
  monitorQuoteTweets: z.boolean().optional(),
  monitorReposts: z.boolean().optional(),
  monitorLikes: z.boolean().optional(),
  notificationChannels: z
    .array(
      z.object({
        platform: z.enum(["discord", "telegram", "slack"]),
        channelId: z.string(),
        serverId: z.string().optional(),
        connectionId: z.string().optional(),
      }),
    )
    .optional(),
  pollingIntervalSeconds: z.number().optional(),
  minFollowerCount: z.number().nullable().optional(),
  filterKeywords: z.array(z.string()).optional(),
  filterMode: z.enum(["include", "exclude"]).optional(),
});

type Params = { params: Promise<{ configId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { configId } = await params;
  const config = await feedConfigService.get(configId, user.organization_id);

  if (!config) {
    return NextResponse.json(
      { error: "Feed config not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      id: config.id,
      sourcePlatform: config.source_platform,
      sourceAccountId: config.source_account_id,
      sourceUsername: config.source_username,
      credentialId: config.credential_id,
      enabled: config.enabled,
      monitorMentions: config.monitor_mentions,
      monitorReplies: config.monitor_replies,
      monitorQuoteTweets: config.monitor_quote_tweets,
      monitorReposts: config.monitor_reposts,
      monitorLikes: config.monitor_likes,
      notificationChannels: config.notification_channels,
      pollingIntervalSeconds: config.polling_interval_seconds,
      minFollowerCount: config.min_follower_count,
      filterKeywords: config.filter_keywords,
      filterMode: config.filter_mode,
      lastPolledAt: config.last_polled_at,
      lastSeenId: config.last_seen_id,
      pollErrorCount: config.poll_error_count,
      lastPollError: config.last_poll_error,
      createdAt: config.created_at,
      updatedAt: config.updated_at,
      createdBy: config.created_by,
    },
  });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { configId } = await params;
  const body = await request.json();
  const updates = UpdateFeedConfigSchema.parse(body);

  logger.info("[API] Updating feed config", {
    configId,
    organizationId: user.organization_id,
  });

  const config = await feedConfigService.update(
    configId,
    user.organization_id,
    {
      sourceUsername: updates.sourceUsername,
      credentialId: updates.credentialId,
      enabled: updates.enabled,
      monitorMentions: updates.monitorMentions,
      monitorReplies: updates.monitorReplies,
      monitorQuoteTweets: updates.monitorQuoteTweets,
      monitorReposts: updates.monitorReposts,
      monitorLikes: updates.monitorLikes,
      notificationChannels: updates.notificationChannels as
        | NotificationChannel[]
        | undefined,
      pollingIntervalSeconds: updates.pollingIntervalSeconds,
      minFollowerCount: updates.minFollowerCount,
      filterKeywords: updates.filterKeywords,
      filterMode: updates.filterMode,
    },
  );

  return NextResponse.json({
    success: true,
    data: {
      id: config.id,
      enabled: config.enabled,
      updatedAt: config.updated_at,
    },
  });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { configId } = await params;

  logger.info("[API] Deleting feed config", {
    configId,
    organizationId: user.organization_id,
  });

  await feedConfigService.delete(configId, user.organization_id);

  return NextResponse.json({ success: true });
}

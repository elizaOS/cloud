import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { engagementEventService } from "@/lib/services/social-feed";

type Params = { params: Promise<{ eventId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { eventId } = await params;
  const event = await engagementEventService.get(eventId, user.organization_id);

  if (!event) {
    return NextResponse.json(
      { error: "Engagement event not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      id: event.id,
      feedConfigId: event.feed_config_id,
      eventType: event.event_type,
      sourcePlatform: event.source_platform,
      sourcePostId: event.source_post_id,
      sourcePostUrl: event.source_post_url,
      authorId: event.author_id,
      authorUsername: event.author_username,
      authorDisplayName: event.author_display_name,
      authorAvatarUrl: event.author_avatar_url,
      authorFollowerCount: event.author_follower_count,
      authorVerified: event.author_verified,
      originalPostId: event.original_post_id,
      originalPostUrl: event.original_post_url,
      originalPostContent: event.original_post_content,
      content: event.content,
      contentHtml: event.content_html,
      mediaUrls: event.media_urls,
      rawData: event.raw_data,
      engagementMetrics: event.engagement_metrics,
      processedAt: event.processed_at,
      notificationSentAt: event.notification_sent_at,
      notificationChannelIds: event.notification_channel_ids,
      notificationMessageIds: event.notification_message_ids,
      createdAt: event.created_at,
    },
  });
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { engagementEventService, type SocialEngagementType } from "@/lib/services/social-feed";

const ListEngagementsQuerySchema = z.object({
  feedConfigId: z.string().uuid().optional(),
  eventType: z.enum(["mention", "reply", "quote_tweet", "repost", "like", "comment", "follow"]).optional(),
  authorId: z.string().optional(),
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
  notificationSent: z.string().optional().transform((v) => v === "true" ? true : v === "false" ? false : undefined),
  limit: z.string().optional().transform((v) => v ? parseInt(v, 10) : 50),
  offset: z.string().optional().transform((v) => v ? parseInt(v, 10) : 0),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = Object.fromEntries(request.nextUrl.searchParams);
  const params = ListEngagementsQuerySchema.parse(searchParams);

  const { events, total } = await engagementEventService.list({
    organizationId: user.organization_id,
    feedConfigId: params.feedConfigId,
    eventType: params.eventType as SocialEngagementType | undefined,
    authorId: params.authorId,
    since: params.since ? new Date(params.since) : undefined,
    until: params.until ? new Date(params.until) : undefined,
    notificationSent: params.notificationSent,
    limit: params.limit,
    offset: params.offset,
  });

  return NextResponse.json({
    success: true,
    data: events.map((e) => ({
      id: e.id,
      feedConfigId: e.feed_config_id,
      eventType: e.event_type,
      sourcePlatform: e.source_platform,
      sourcePostId: e.source_post_id,
      sourcePostUrl: e.source_post_url,
      authorId: e.author_id,
      authorUsername: e.author_username,
      authorDisplayName: e.author_display_name,
      authorAvatarUrl: e.author_avatar_url,
      authorFollowerCount: e.author_follower_count,
      authorVerified: e.author_verified,
      originalPostId: e.original_post_id,
      originalPostUrl: e.original_post_url,
      originalPostContent: e.original_post_content,
      content: e.content,
      contentHtml: e.content_html,
      mediaUrls: e.media_urls,
      engagementMetrics: e.engagement_metrics,
      notificationSentAt: e.notification_sent_at,
      createdAt: e.created_at,
    })),
    total,
    limit: params.limit,
    offset: params.offset,
  });
}

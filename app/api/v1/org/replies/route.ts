import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import {
  replyConfirmationService,
  type ReplyConfirmationStatus,
} from "@/lib/services/social-feed";
import { logger } from "@/lib/utils/logger";

const ListRepliesQuerySchema = z.object({
  status: z
    .enum(["pending", "confirmed", "rejected", "expired", "sent", "failed"])
    .optional(),
  sourcePlatform: z.string().optional(),
  engagementEventId: z.string().uuid().optional(),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 20)),
  offset: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 0)),
});

const CreateReplySchema = z.object({
  engagementEventId: z.string().uuid().optional(),
  targetPlatform: z.string(),
  targetPostId: z.string(),
  targetPostUrl: z.string().optional(),
  replyContent: z.string().min(1).max(10000),
  replyMediaUrls: z.array(z.string().url()).optional(),
  expiresInMinutes: z.number().optional().default(60),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = Object.fromEntries(request.nextUrl.searchParams);
  const params = ListRepliesQuerySchema.parse(searchParams);

  const { confirmations, total } = await replyConfirmationService.list({
    organizationId: user.organization_id,
    status: params.status as ReplyConfirmationStatus | undefined,
    sourcePlatform: params.sourcePlatform,
    engagementEventId: params.engagementEventId,
    limit: params.limit,
    offset: params.offset,
  });

  return NextResponse.json({
    success: true,
    data: confirmations.map((c) => ({
      id: c.id,
      engagementEventId: c.engagement_event_id,
      targetPlatform: c.target_platform,
      targetPostId: c.target_post_id,
      targetPostUrl: c.target_post_url,
      sourcePlatform: c.source_platform,
      sourceChannelId: c.source_channel_id,
      sourceServerId: c.source_server_id,
      sourceMessageId: c.source_message_id,
      sourceUserId: c.source_user_id,
      sourceUsername: c.source_username,
      sourceUserDisplayName: c.source_user_display_name,
      replyContent: c.reply_content,
      replyMediaUrls: c.reply_media_urls,
      status: c.status,
      confirmationMessageId: c.confirmation_message_id,
      confirmedByUserId: c.confirmed_by_user_id,
      confirmedByUsername: c.confirmed_by_username,
      confirmedAt: c.confirmed_at,
      rejectionReason: c.rejection_reason,
      sentPostId: c.sent_post_id,
      sentPostUrl: c.sent_post_url,
      sentAt: c.sent_at,
      errorMessage: c.error_message,
      retryCount: c.retry_count,
      expiresAt: c.expires_at,
      createdAt: c.created_at,
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
  const params = CreateReplySchema.parse(body);

  logger.info("[API] Creating manual reply confirmation", {
    organizationId: user.organization_id,
    targetPlatform: params.targetPlatform,
  });

  const expiresAt = new Date(Date.now() + params.expiresInMinutes * 60 * 1000);

  const confirmation = await replyConfirmationService.create({
    organizationId: user.organization_id,
    engagementEventId: params.engagementEventId,
    targetPlatform: params.targetPlatform,
    targetPostId: params.targetPostId,
    targetPostUrl: params.targetPostUrl,
    sourcePlatform: "web",
    sourceChannelId: "api",
    sourceMessageId: `api-${Date.now()}`,
    sourceUserId: user.id,
    sourceUsername: user.email ?? undefined,
    replyContent: params.replyContent,
    replyMediaUrls: params.replyMediaUrls,
    expiresAt,
  });

  return NextResponse.json(
    {
      success: true,
      data: {
        id: confirmation.id,
        status: confirmation.status,
        expiresAt: confirmation.expires_at,
        message: "Reply confirmation created. Use PATCH to approve or reject.",
      },
    },
    { status: 201 },
  );
}

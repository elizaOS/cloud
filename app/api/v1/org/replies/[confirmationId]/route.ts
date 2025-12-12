import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { replyConfirmationService } from "@/lib/services/social-feed";
import { replyRouterService } from "@/lib/services/social-feed/reply-router";
import { logger } from "@/lib/utils/logger";

const UpdateReplySchema = z.object({
  action: z.enum(["confirm", "reject"]),
  reason: z.string().optional(),
});

type Params = { params: Promise<{ confirmationId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { confirmationId } = await params;
  const confirmation = await replyConfirmationService.get(confirmationId, user.organization_id);

  if (!confirmation) {
    return NextResponse.json({ error: "Reply confirmation not found" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    data: {
      id: confirmation.id,
      engagementEventId: confirmation.engagement_event_id,
      targetPlatform: confirmation.target_platform,
      targetPostId: confirmation.target_post_id,
      targetPostUrl: confirmation.target_post_url,
      sourcePlatform: confirmation.source_platform,
      sourceChannelId: confirmation.source_channel_id,
      sourceServerId: confirmation.source_server_id,
      sourceMessageId: confirmation.source_message_id,
      sourceUserId: confirmation.source_user_id,
      sourceUsername: confirmation.source_username,
      sourceUserDisplayName: confirmation.source_user_display_name,
      replyContent: confirmation.reply_content,
      replyMediaUrls: confirmation.reply_media_urls,
      status: confirmation.status,
      confirmationMessageId: confirmation.confirmation_message_id,
      confirmationChannelId: confirmation.confirmation_channel_id,
      confirmedByUserId: confirmation.confirmed_by_user_id,
      confirmedByUsername: confirmation.confirmed_by_username,
      confirmedAt: confirmation.confirmed_at,
      rejectionReason: confirmation.rejection_reason,
      sentPostId: confirmation.sent_post_id,
      sentPostUrl: confirmation.sent_post_url,
      sentAt: confirmation.sent_at,
      errorMessage: confirmation.error_message,
      retryCount: confirmation.retry_count,
      expiresAt: confirmation.expires_at,
      createdAt: confirmation.created_at,
      updatedAt: confirmation.updated_at,
    },
  });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { confirmationId } = await params;
  const body = await request.json();
  const { action, reason } = UpdateReplySchema.parse(body);

  logger.info("[API] Processing reply confirmation", {
    confirmationId,
    action,
    userId: user.id,
  });

  if (action === "confirm") {
    const result = await replyRouterService.handleConfirmation(
      confirmationId,
      user.organization_id,
      user.id,
      user.email ?? undefined
    );

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.error,
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: {
        status: "sent",
        postId: result.postId,
        postUrl: result.postUrl,
      },
    });
  } else {
    await replyRouterService.handleRejection(
      confirmationId,
      user.organization_id,
      user.id,
      reason
    );

    return NextResponse.json({
      success: true,
      data: {
        status: "rejected",
        reason,
      },
    });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { confirmationId } = await params;

  logger.info("[API] Cancelling reply confirmation", {
    confirmationId,
    userId: user.id,
  });

  // Reject the reply to mark it as cancelled
  await replyRouterService.handleRejection(
    confirmationId,
    user.organization_id,
    user.id,
    "Cancelled by user"
  );

  return NextResponse.json({ success: true });
}

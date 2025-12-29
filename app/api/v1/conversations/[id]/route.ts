import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { conversationsService } from "@/lib/services/conversations";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const UpdateConversationSchema = z.object({
  title: z.string().min(1).max(200),
});

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/conversations/[id]
 * Gets a conversation with its messages.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  await requireAuth();
  const { id } = await params;

  const conversation = await conversationsService.getWithMessages(id);

  if (!conversation) {
    return NextResponse.json(
      { success: false, error: "Conversation not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true, data: { conversation } });
}

/**
 * PATCH /api/v1/conversations/[id]
 * Updates the title of an existing conversation.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  await requireAuth();
  const { id } = await params;

  const body = await request.json();
  const parsed = UpdateConversationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Validation error", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const conversation = await conversationsService.update(id, {
    title: parsed.data.title,
  });

  if (!conversation) {
    return NextResponse.json(
      { success: false, error: "Conversation not found" },
      { status: 404 },
    );
  }

  logger.info("[Conversations API] Updated conversation", {
    conversationId: id,
  });

  revalidatePath("/dashboard/chat");

  return NextResponse.json({ success: true, data: { conversation } });
}

/**
 * DELETE /api/v1/conversations/[id]
 * Deletes a conversation.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  await requireAuth();
  const { id } = await params;

  await conversationsService.delete(id);

  logger.info("[Conversations API] Deleted conversation", {
    conversationId: id,
  });

  revalidatePath("/dashboard/chat");

  return NextResponse.json({ success: true });
}


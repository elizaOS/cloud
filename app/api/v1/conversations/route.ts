import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { conversationsService } from "@/lib/services/conversations";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const CreateConversationSchema = z.object({
  title: z.string().min(1).max(200),
  model: z.string().min(1).max(100),
});

/**
 * GET /api/v1/conversations
 * Lists all conversations for the authenticated user.
 */
export async function GET(request: NextRequest) {
  const user = await requireAuth();

  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);

  const conversations = await conversationsService.listByUser(user.id, limit);

  return NextResponse.json({
    success: true,
    data: { conversations },
  });
}

/**
 * POST /api/v1/conversations
 * Creates a new conversation for the authenticated user.
 */
export async function POST(request: NextRequest) {
  const user = await requireAuth();

  const body = await request.json();
  const parsed = CreateConversationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Validation error", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const conversation = await conversationsService.create({
    title: parsed.data.title,
    model: parsed.data.model,
    organization_id: user.organization_id,
    user_id: user.id,
    status: "active",
  });

  logger.info("[Conversations API] Created conversation", {
    conversationId: conversation.id,
    userId: user.id,
  });

  revalidatePath("/dashboard/chat");

  return NextResponse.json(
    { success: true, data: { conversation } },
    { status: 201 },
  );
}


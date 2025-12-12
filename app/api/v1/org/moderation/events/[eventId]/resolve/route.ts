/**
 * Resolve Moderation Event API
 *
 * POST /api/v1/org/moderation/events/[eventId]/resolve - Mark event as resolved
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { communityModerationService } from "@/lib/services/community-moderation";

const ResolveSchema = z.object({
  falsePositive: z.boolean().optional().default(false),
  notes: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { eventId } = await params;

  const body = await request.json();
  const parsed = ResolveSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.format() },
      { status: 400 }
    );
  }

  const { falsePositive, notes } = parsed.data;

  await communityModerationService.events.resolveEvent(
    eventId,
    user.id,
    notes,
    falsePositive
  );

  return NextResponse.json({
    success: true,
    message: falsePositive
      ? "Event marked as false positive"
      : "Event resolved",
  });
}



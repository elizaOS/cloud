/**
 * Device Bus — publish a cross-device intent.
 *
 * POST /api/v1/device-bus/intents
 *
 * Body: { kind: string, payload?: object, userId?: uuid }
 *
 * Stores the intent for the owner's devices to pick up via poll. WebSocket /
 * push fan-out is a follow-up (see T9g deferred work).
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { dbWrite } from "@/db/helpers";
import { deviceIntents } from "@/db/schemas";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const publishSchema = z.object({
  kind: z.string().min(1).max(64),
  payload: z.record(z.string(), z.unknown()).optional(),
  userId: z.string().uuid().optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const body = await request.json().catch(() => null);
  const parsed = publishSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  const { kind, payload, userId } = parsed.data;
  // Auth: the caller can only publish for themselves unless they are an admin.
  // Admin check is out of scope for the initial rollout — restrict hard.
  const targetUserId = userId ?? user.id;
  if (targetUserId !== user.id) {
    return NextResponse.json(
      { error: "Cannot publish intents for a different user" },
      { status: 403 },
    );
  }

  const [row] = await dbWrite
    .insert(deviceIntents)
    .values({
      user_id: targetUserId,
      kind: kind.toLowerCase(),
      payload: payload ?? {},
      delivered_to: [],
    })
    .returning();

  if (!row) {
    logger.error("[device-bus] failed to insert intent", {
      userId: targetUserId,
      kind,
    });
    return NextResponse.json({ error: "Failed to publish intent" }, { status: 500 });
  }

  return NextResponse.json({
    intentId: row.id,
    kind: row.kind,
    createdAt: row.created_at,
    deliveredTo: [],
  });
}

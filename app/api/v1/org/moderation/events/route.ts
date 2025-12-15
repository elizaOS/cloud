/**
 * Moderation Events API
 *
 * GET /api/v1/org/moderation/events - List moderation events
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { communityModerationService } from "@/lib/services/community-moderation";
import { db } from "@/db";
import { eq, and, isNull, isNotNull, desc } from "drizzle-orm";
import { orgModerationEvents } from "@/db/schemas/org-community-moderation";

const QuerySchema = z.object({
  serverId: z.string().uuid(),
  unresolved: z.string().optional(),
  resolved: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional().default(50),
});

export async function GET(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const { searchParams } = request.nextUrl;
  const parsed = QuerySchema.safeParse({
    serverId: searchParams.get("serverId"),
    unresolved: searchParams.get("unresolved"),
    resolved: searchParams.get("resolved"),
    limit: searchParams.get("limit"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: parsed.error.format() },
      { status: 400 },
    );
  }

  const { serverId, unresolved, resolved, limit } = parsed.data;

  let conditions = and(
    eq(orgModerationEvents.server_id, serverId),
    eq(orgModerationEvents.organization_id, user.organization_id),
  );

  if (unresolved === "true") {
    conditions = and(conditions, isNull(orgModerationEvents.resolved_at));
  } else if (resolved === "true") {
    conditions = and(conditions, isNotNull(orgModerationEvents.resolved_at));
  }

  const events = await db
    .select()
    .from(orgModerationEvents)
    .where(conditions)
    .orderBy(desc(orgModerationEvents.created_at))
    .limit(limit);

  return NextResponse.json({ events });
}

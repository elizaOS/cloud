/**
 * Device Bus — subscribe (via poll) to intents delivered to a device.
 *
 * GET /api/v1/device-bus/devices/:deviceId/intents?since=<ISO>
 *
 * Returns intents for the calling user, created strictly after `since`
 * (default: 24h ago). The device atomically marks which ids it has seen by
 * including them in its next request's `since`. WebSocket push is a
 * follow-up.
 */

import { and, eq, gt } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { dbRead, dbWrite } from "@/db/helpers";
import { deviceIntents, devices } from "@/db/schemas";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ deviceId: string }> },
): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { deviceId } = await context.params;

  const [device] = await dbRead
    .select()
    .from(devices)
    .where(and(eq(devices.id, deviceId), eq(devices.user_id, user.id)))
    .limit(1);

  if (!device) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const sinceParam = url.searchParams.get("since");
  const since = sinceParam
    ? new Date(sinceParam)
    : new Date(Date.now() - DEFAULT_LOOKBACK_MS);

  if (Number.isNaN(since.getTime())) {
    return NextResponse.json(
      { error: "Invalid 'since' parameter" },
      { status: 400 },
    );
  }

  const rows = await dbRead
    .select()
    .from(deviceIntents)
    .where(
      and(
        eq(deviceIntents.user_id, user.id),
        gt(deviceIntents.created_at, since),
      ),
    )
    .orderBy(deviceIntents.created_at);

  // Update presence heartbeat for this device.
  await dbWrite
    .update(devices)
    .set({ last_seen_at: new Date(), online: true })
    .where(eq(devices.id, deviceId));

  // Record that this device has observed these intents (non-atomic; good
  // enough for poll — proper dedup/ack is a follow-up with WebSocket).
  for (const row of rows) {
    const delivered = Array.isArray(row.delivered_to)
      ? [...row.delivered_to]
      : [];
    if (!delivered.includes(deviceId)) {
      delivered.push(deviceId);
      await dbWrite
        .update(deviceIntents)
        .set({ delivered_to: delivered })
        .where(eq(deviceIntents.id, row.id));
    }
  }

  return NextResponse.json({
    deviceId,
    since: since.toISOString(),
    intents: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      payload: r.payload,
      createdAt: r.created_at,
    })),
  });
}

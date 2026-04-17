/**
 * Device Bus — register / upsert a paired device.
 *
 * POST /api/v1/device-bus/devices
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { dbWrite } from "@/db/helpers";
import { devices } from "@/db/schemas";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const registerSchema = z.object({
  deviceId: z.string().uuid().optional(),
  platform: z.enum(["macos", "ios", "android", "windows", "linux", "web"]),
  pushToken: z.string().min(1).optional(),
  label: z.string().min(1).max(128).optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  const { deviceId, platform, pushToken, label } = parsed.data;

  const [row] = await dbWrite
    .insert(devices)
    .values({
      id: deviceId,
      user_id: user.id,
      platform,
      push_token: pushToken ?? null,
      label: label ?? null,
      online: true,
    })
    .onConflictDoUpdate({
      target: devices.id,
      set: {
        platform,
        push_token: pushToken ?? null,
        label: label ?? null,
        online: true,
        last_seen_at: new Date(),
      },
    })
    .returning();

  if (!row) {
    logger.error("[device-bus] failed to insert device", {
      userId: user.id,
      platform,
    });
    return NextResponse.json(
      { error: "Failed to register device" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    deviceId: row.id,
    userId: row.user_id,
    platform: row.platform,
    lastSeenAt: row.last_seen_at,
    online: row.online,
  });
}

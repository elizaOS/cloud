/**
 * Event Emission API
 *
 * POST /api/v1/events/emit - Emit a custom event
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { eventEmitter } from "@/lib/services/events/event-emitter";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

const emitEventSchema = z.object({
  eventType: z.string().min(1),
  data: z.record(z.unknown()),
});

/**
 * POST /api/v1/events/emit
 * Emit a custom event
 */
export async function POST(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  if (!user.organization_id) {
    return NextResponse.json(
      { success: false, error: "Organization required" },
      { status: 403 },
    );
  }

  const body = await request.json();
  const validation = emitEventSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid request",
        details: validation.error.format(),
      },
      { status: 400 },
    );
  }

  const { eventType, data } = validation.data;

  await eventEmitter.emit({
    eventType,
    organizationId: user.organization_id,
    timestamp: new Date().toISOString(),
    data,
  });

  logger.info("[Events API] Event emitted", {
    eventType,
    organizationId: user.organization_id,
  });

  return NextResponse.json({
    success: true,
  });
}


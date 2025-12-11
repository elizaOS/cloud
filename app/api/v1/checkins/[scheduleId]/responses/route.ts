/**
 * Check-in Responses API - Record and list check-in responses
 *
 * GET  /api/v1/checkins/:scheduleId/responses - List responses
 * POST /api/v1/checkins/:scheduleId/responses - Record response
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { checkinsService } from "@/lib/services/checkins";

const RecordSchema = z.object({
  responderPlatformId: z.string().min(1),
  responderPlatform: z.enum(["discord", "telegram"]),
  responderName: z.string().optional(),
  responderAvatar: z.string().optional(),
  answers: z.record(z.string(), z.string()),
  sourceMessageId: z.string().optional(),
  sourceChannelId: z.string().optional(),
  checkinDate: z.string().datetime().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ scheduleId: string }> }
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { scheduleId } = await params;
  const searchParams = Object.fromEntries(request.nextUrl.searchParams);

  const startDate = searchParams.startDate ? new Date(searchParams.startDate) : undefined;
  const endDate = searchParams.endDate ? new Date(searchParams.endDate) : undefined;
  const limit = searchParams.limit ? parseInt(searchParams.limit) : 50;

  const responses = await checkinsService.listResponses(scheduleId, user.organization_id, {
    startDate,
    endDate,
    limit,
  });

  return NextResponse.json({
    responses: responses.map(r => ({
      id: r.id,
      scheduleId: r.schedule_id,
      responderPlatformId: r.responder_platform_id,
      responderPlatform: r.responder_platform,
      responderName: r.responder_name,
      answers: r.answers,
      checkinDate: r.checkin_date.toISOString(),
      createdAt: r.created_at.toISOString(),
    })),
    total: responses.length,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ scheduleId: string }> }
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { scheduleId } = await params;

  const body = await request.json();
  const parsed = RecordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.format() }, { status: 400 });
  }

  const data = parsed.data;
  const response = await checkinsService.recordResponse({
    scheduleId,
    organizationId: user.organization_id,
    responderPlatformId: data.responderPlatformId,
    responderPlatform: data.responderPlatform,
    responderName: data.responderName,
    responderAvatar: data.responderAvatar,
    answers: data.answers,
    sourceMessageId: data.sourceMessageId,
    sourceChannelId: data.sourceChannelId,
    checkinDate: data.checkinDate ? new Date(data.checkinDate) : undefined,
  });

  return NextResponse.json({
    response: {
      id: response.id,
      scheduleId: response.schedule_id,
      responderPlatformId: response.responder_platform_id,
      responderPlatform: response.responder_platform,
      checkinDate: response.checkin_date.toISOString(),
    },
  }, { status: 201 });
}


/**
 * Check-in Schedule API - Individual schedule operations
 *
 * GET    /api/v1/checkins/:scheduleId - Get schedule details
 * PUT    /api/v1/checkins/:scheduleId - Update schedule
 * DELETE /api/v1/checkins/:scheduleId - Delete schedule
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { checkinsService } from "@/lib/services/checkins";

const UpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  checkinType: z
    .enum([
      "standup",
      "sprint",
      "mental_health",
      "project_status",
      "retrospective",
    ])
    .optional(),
  frequency: z
    .enum(["daily", "weekdays", "weekly", "bi_weekly", "monthly"])
    .optional(),
  timeUtc: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  timezone: z.string().optional(),
  checkinChannelId: z.string().optional(),
  reportChannelId: z.string().optional(),
  questions: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ scheduleId: string }> },
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { scheduleId } = await params;

  const schedule = await checkinsService.getSchedule(
    scheduleId,
    user.organization_id,
  );
  if (!schedule) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }

  return NextResponse.json({
    schedule: {
      id: schedule.id,
      serverId: schedule.server_id,
      name: schedule.name,
      checkinType: schedule.checkin_type,
      frequency: schedule.frequency,
      timeUtc: schedule.time_utc,
      timezone: schedule.timezone,
      checkinChannelId: schedule.checkin_channel_id,
      reportChannelId: schedule.report_channel_id,
      questions: schedule.questions,
      enabled: schedule.enabled,
      createdAt: schedule.created_at.toISOString(),
    },
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ scheduleId: string }> },
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { scheduleId } = await params;

  const body = await request.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.format() },
      { status: 400 },
    );
  }

  const schedule = await checkinsService.updateSchedule(
    scheduleId,
    user.organization_id,
    parsed.data,
  );
  if (!schedule) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }

  return NextResponse.json({
    schedule: {
      id: schedule.id,
      serverId: schedule.server_id,
      name: schedule.name,
      checkinType: schedule.checkin_type,
      frequency: schedule.frequency,
      timeUtc: schedule.time_utc,
      enabled: schedule.enabled,
    },
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ scheduleId: string }> },
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { scheduleId } = await params;

  const deleted = await checkinsService.deleteSchedule(
    scheduleId,
    user.organization_id,
  );
  if (!deleted) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

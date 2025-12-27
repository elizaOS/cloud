/**
 * Check-ins API - Team check-in schedules and responses
 *
 * GET  /api/v1/checkins - List check-in schedules
 * POST /api/v1/checkins - Create check-in schedule
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { checkinsService } from "@/lib/services/checkins";

const CreateSchema = z.object({
  serverId: z.string().uuid(),
  name: z.string().min(1).max(200),
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
  timeUtc: z.string().regex(/^\d{2}:\d{2}$/),
  timezone: z.string().optional(),
  checkinChannelId: z.string().min(1),
  reportChannelId: z.string().optional(),
  questions: z.array(z.string()).optional(),
});

export async function GET(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const params = Object.fromEntries(request.nextUrl.searchParams);

  const serverId = params.serverId;

  const schedules = serverId
    ? await checkinsService.listServerSchedules(serverId)
    : await checkinsService.listSchedules(user.organization_id);

  return NextResponse.json({
    schedules: schedules.map((s) => ({
      id: s.id,
      serverId: s.server_id,
      name: s.name,
      checkinType: s.checkin_type,
      frequency: s.frequency,
      timeUtc: s.time_utc,
      timezone: s.timezone,
      checkinChannelId: s.checkin_channel_id,
      reportChannelId: s.report_channel_id,
      questions: s.questions,
      enabled: s.enabled,
      createdAt: s.created_at.toISOString(),
    })),
    total: schedules.length,
  });
}

export async function POST(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.format() },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const schedule = await checkinsService.createSchedule({
    organizationId: user.organization_id,
    serverId: data.serverId,
    name: data.name,
    checkinType: data.checkinType,
    frequency: data.frequency,
    timeUtc: data.timeUtc,
    timezone: data.timezone,
    checkinChannelId: data.checkinChannelId,
    reportChannelId: data.reportChannelId,
    questions: data.questions,
    createdBy: user.id,
  });

  return NextResponse.json(
    {
      schedule: {
        id: schedule.id,
        serverId: schedule.server_id,
        name: schedule.name,
        checkinType: schedule.checkin_type,
        frequency: schedule.frequency,
        timeUtc: schedule.time_utc,
        enabled: schedule.enabled,
        createdAt: schedule.created_at.toISOString(),
      },
    },
    { status: 201 },
  );
}

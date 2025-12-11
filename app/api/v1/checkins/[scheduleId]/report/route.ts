/**
 * Check-in Report API - Generate reports from check-in data
 *
 * POST /api/v1/checkins/:scheduleId/report - Generate report
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { checkinsService } from "@/lib/services/checkins";

const ReportSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ scheduleId: string }> }
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { scheduleId } = await params;

  const body = await request.json();
  const parsed = ReportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.format() }, { status: 400 });
  }

  const report = await checkinsService.generateReport(
    scheduleId,
    user.organization_id,
    {
      start: new Date(parsed.data.startDate),
      end: new Date(parsed.data.endDate),
    }
  );

  return NextResponse.json({ report });
}


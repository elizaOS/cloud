import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { miladyGoogleRouteDeps } from "@/lib/services/milady-google-route-deps";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const attendeeSchema = z.object({
  email: z.string().email(),
  displayName: z.string().trim().min(1).optional(),
  optional: z.boolean().optional(),
});

const requestSchema = z.object({
  side: z.enum(["owner", "agent"]).optional(),
  calendarId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1),
  description: z.string().optional(),
  location: z.string().optional(),
  startAt: z.string().trim().min(1),
  endAt: z.string().trim().min(1),
  timeZone: z.string().trim().min(1),
  attendees: z.array(attendeeSchema).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const { user } = await miladyGoogleRouteDeps.requireAuthOrApiKeyWithOrg(request);
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid calendar event request.", details: parsed.error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json(
      await miladyGoogleRouteDeps.createManagedGoogleCalendarEvent({
        organizationId: user.organization_id,
        userId: user.id,
        side: parsed.data.side ?? "owner",
        calendarId: parsed.data.calendarId ?? "primary",
        title: parsed.data.title,
        description: parsed.data.description,
        location: parsed.data.location,
        startAt: parsed.data.startAt,
        endAt: parsed.data.endAt,
        timeZone: parsed.data.timeZone,
        attendees: parsed.data.attendees,
      }),
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof miladyGoogleRouteDeps.MiladyGoogleConnectorError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create Google Calendar event." },
      { status: 500 },
    );
  }
}

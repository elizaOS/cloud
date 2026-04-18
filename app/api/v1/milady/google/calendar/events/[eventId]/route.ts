import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { miladyGoogleRouteDeps } from "@/lib/services/milady-google-route-deps";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

const attendeeSchema = z.object({
  email: z.string().email(),
  displayName: z.string().trim().min(1).optional(),
  optional: z.boolean().optional(),
});

const patchRequestSchema = z.object({
  side: z.enum(["owner", "agent"]).optional(),
  calendarId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  startAt: z.string().trim().min(1).optional(),
  endAt: z.string().trim().min(1).optional(),
  timeZone: z.string().trim().min(1).optional(),
  attendees: z.array(attendeeSchema).optional(),
});

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { user } = await miladyGoogleRouteDeps.requireAuthOrApiKeyWithOrg(request);
    const { eventId } = await params;
    const parsed = patchRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid calendar event update request.",
          details: parsed.error.issues,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      await miladyGoogleRouteDeps.updateManagedGoogleCalendarEvent({
        organizationId: user.organization_id,
        userId: user.id,
        side: parsed.data.side ?? "owner",
        calendarId: parsed.data.calendarId ?? "primary",
        eventId,
        title: parsed.data.title,
        description: parsed.data.description,
        location: parsed.data.location,
        startAt: parsed.data.startAt,
        endAt: parsed.data.endAt,
        timeZone: parsed.data.timeZone,
        attendees: parsed.data.attendees,
      }),
    );
  } catch (error) {
    if (error instanceof miladyGoogleRouteDeps.MiladyGoogleConnectorError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update Google Calendar event.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { user } = await miladyGoogleRouteDeps.requireAuthOrApiKeyWithOrg(request);
    const { eventId } = await params;
    const sideRaw = request.nextUrl.searchParams.get("side");
    const calendarIdRaw = request.nextUrl.searchParams.get("calendarId");
    if (sideRaw && sideRaw !== "owner" && sideRaw !== "agent") {
      return NextResponse.json(
        { error: "Invalid calendar event delete request." },
        { status: 400 },
      );
    }
    if (calendarIdRaw !== null && calendarIdRaw.trim().length === 0) {
      return NextResponse.json(
        { error: "Invalid calendar event delete request." },
        { status: 400 },
      );
    }

    return NextResponse.json(
      await miladyGoogleRouteDeps.deleteManagedGoogleCalendarEvent({
        organizationId: user.organization_id,
        userId: user.id,
        side: (sideRaw as "owner" | "agent" | null) ?? "owner",
        calendarId: calendarIdRaw?.trim() || "primary",
        eventId,
      }),
    );
  } catch (error) {
    if (error instanceof miladyGoogleRouteDeps.MiladyGoogleConnectorError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to delete Google Calendar event.",
      },
      { status: 500 },
    );
  }
}

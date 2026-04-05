import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import {
  fetchManagedGoogleCalendarFeed,
  MiladyGoogleConnectorError,
} from "@/lib/services/milady-google-connector";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const searchParams = request.nextUrl.searchParams;
    const calendarId = searchParams.get("calendarId")?.trim() || "primary";
    const timeMin = searchParams.get("timeMin")?.trim();
    const timeMax = searchParams.get("timeMax")?.trim();
    const timeZone = searchParams.get("timeZone")?.trim() || "UTC";

    if (!timeMin || !timeMax) {
      return NextResponse.json({ error: "timeMin and timeMax are required." }, { status: 400 });
    }

    return NextResponse.json(
      await fetchManagedGoogleCalendarFeed({
        organizationId: user.organization_id,
        userId: user.id,
        calendarId,
        timeMin,
        timeMax,
        timeZone,
      }),
    );
  } catch (error) {
    if (error instanceof MiladyGoogleConnectorError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch Google Calendar." },
      { status: 500 },
    );
  }
}

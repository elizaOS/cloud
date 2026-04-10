import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { miladyGoogleRouteDeps } from "@/lib/services/milady-google-route-deps";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    const { user } = await miladyGoogleRouteDeps.requireAuthOrApiKeyWithOrg(request);
    const searchParams = request.nextUrl.searchParams;
    const rawSide = searchParams.get("side");
    const calendarId = searchParams.get("calendarId")?.trim() || "primary";
    const timeMin = searchParams.get("timeMin")?.trim();
    const timeMax = searchParams.get("timeMax")?.trim();
    const timeZone = searchParams.get("timeZone")?.trim() || "UTC";

    if (rawSide !== null && rawSide !== "owner" && rawSide !== "agent") {
      return NextResponse.json({ error: "side must be owner or agent." }, { status: 400 });
    }
    if (!timeMin || !timeMax) {
      return NextResponse.json({ error: "timeMin and timeMax are required." }, { status: 400 });
    }

    return NextResponse.json(
      await miladyGoogleRouteDeps.fetchManagedGoogleCalendarFeed({
        organizationId: user.organization_id,
        userId: user.id,
        side: rawSide === "agent" ? "agent" : "owner",
        calendarId,
        timeMin,
        timeMax,
        timeZone,
      }),
    );
  } catch (error) {
    if (error instanceof miladyGoogleRouteDeps.MiladyGoogleConnectorError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch Google Calendar." },
      { status: 500 },
    );
  }
}

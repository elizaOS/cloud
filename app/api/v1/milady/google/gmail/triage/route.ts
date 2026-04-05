import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import {
  fetchManagedGoogleGmailTriage,
  MiladyGoogleConnectorError,
} from "@/lib/services/milady-google-connector";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const rawSide = request.nextUrl.searchParams.get("side");
    const rawMaxResults = request.nextUrl.searchParams.get("maxResults");
    if (rawSide !== null && rawSide !== "owner" && rawSide !== "agent") {
      return NextResponse.json({ error: "side must be owner or agent." }, { status: 400 });
    }
    const maxResults =
      rawMaxResults && rawMaxResults.trim().length > 0 ? Number.parseInt(rawMaxResults, 10) : 12;
    if (!Number.isFinite(maxResults) || maxResults <= 0) {
      return NextResponse.json(
        { error: "maxResults must be a positive integer." },
        { status: 400 },
      );
    }

    return NextResponse.json(
      await fetchManagedGoogleGmailTriage({
        organizationId: user.organization_id,
        userId: user.id,
        side: rawSide === "agent" ? "agent" : "owner",
        maxResults,
      }),
    );
  } catch (error) {
    if (error instanceof MiladyGoogleConnectorError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch Gmail triage." },
      { status: 500 },
    );
  }
}

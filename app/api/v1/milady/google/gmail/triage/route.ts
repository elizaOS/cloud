import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { miladyGoogleRouteDeps } from "@/lib/services/milady-google-route-deps";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    const { user } = await miladyGoogleRouteDeps.requireAuthOrApiKeyWithOrg(request);
    const rawSide = request.nextUrl.searchParams.get("side");
    const grantId = request.nextUrl.searchParams.get("grantId")?.trim();
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
      await miladyGoogleRouteDeps.fetchManagedGoogleGmailTriage({
        organizationId: user.organization_id,
        userId: user.id,
        side: rawSide === "agent" ? "agent" : "owner",
        grantId: grantId && grantId.length > 0 ? grantId : undefined,
        maxResults,
      }),
    );
  } catch (error) {
    if (error instanceof miladyGoogleRouteDeps.MiladyGoogleConnectorError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch Gmail triage.",
      },
      { status: 500 },
    );
  }
}

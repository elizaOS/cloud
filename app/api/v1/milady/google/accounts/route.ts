import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { miladyGoogleRouteDeps } from "@/lib/services/milady-google-route-deps";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    const { user } = await miladyGoogleRouteDeps.requireAuthOrApiKeyWithOrg(request);
    const rawSide = request.nextUrl.searchParams.get("side");
    if (rawSide !== null && rawSide !== "owner" && rawSide !== "agent") {
      return NextResponse.json({ error: "side must be owner or agent." }, { status: 400 });
    }
    const accounts = await miladyGoogleRouteDeps.listManagedGoogleConnectorAccounts({
      organizationId: user.organization_id,
      userId: user.id,
      side: rawSide === "owner" || rawSide === "agent" ? rawSide : undefined,
    });
    return NextResponse.json(accounts);
  } catch (error) {
    if (error instanceof miladyGoogleRouteDeps.MiladyGoogleConnectorError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list Google accounts." },
      { status: 500 },
    );
  }
}

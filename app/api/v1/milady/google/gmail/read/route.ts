import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { miladyGoogleRouteDeps } from "@/lib/services/milady-google-route-deps";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    const { user } = await miladyGoogleRouteDeps.requireAuthOrApiKeyWithOrg(request);
    const rawSide = request.nextUrl.searchParams.get("side");
    const messageId = request.nextUrl.searchParams.get("messageId");

    if (rawSide !== null && rawSide !== "owner" && rawSide !== "agent") {
      return NextResponse.json({ error: "side must be owner or agent." }, { status: 400 });
    }
    if (!messageId || messageId.trim().length === 0) {
      return NextResponse.json({ error: "messageId is required." }, { status: 400 });
    }

    return NextResponse.json(
      await miladyGoogleRouteDeps.readManagedGoogleGmailMessage({
        organizationId: user.organization_id,
        userId: user.id,
        side: rawSide === "agent" ? "agent" : "owner",
        messageId: messageId.trim(),
      }),
    );
  } catch (error) {
    if (error instanceof miladyGoogleRouteDeps.MiladyGoogleConnectorError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to read Gmail message.",
      },
      { status: 500 },
    );
  }
}

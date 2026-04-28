import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { getXFeed } from "@/lib/services/x";
import { xRouteErrorResponse } from "../error-response";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest): Promise<NextResponse | Response> {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const rawMaxResults = request.nextUrl.searchParams.get("maxResults");
    const maxResults =
      rawMaxResults && rawMaxResults.trim().length > 0
        ? Number.parseInt(rawMaxResults, 10)
        : undefined;
    const connectionRole =
      request.nextUrl.searchParams.get("connectionRole") === "agent" ? "agent" : "owner";
    const result = await getXFeed({
      organizationId: user.organization_id,
      connectionRole,
      feedType: request.nextUrl.searchParams.get("feedType") ?? undefined,
      query: request.nextUrl.searchParams.get("query") ?? undefined,
      maxResults,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return xRouteErrorResponse(error);
  }
}

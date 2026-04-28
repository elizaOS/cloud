import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { getXCloudStatus } from "@/lib/services/x";
import { xRouteErrorResponse } from "../error-response";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest): Promise<NextResponse | Response> {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const connectionRole =
      request.nextUrl.searchParams.get("connectionRole") === "agent" ? "agent" : "owner";
    const status = await getXCloudStatus(user.organization_id, connectionRole);
    return NextResponse.json({
      success: true,
      ...status,
    });
  } catch (error) {
    return xRouteErrorResponse(error);
  }
}

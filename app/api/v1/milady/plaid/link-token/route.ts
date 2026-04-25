import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { miladyPlaidRouteDeps } from "@/lib/services/milady-plaid-route-deps";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const { user } = await miladyPlaidRouteDeps.requireAuthOrApiKeyWithOrg(
      request,
    );
    const result = await miladyPlaidRouteDeps.createPlaidLinkToken({
      organizationId: user.organization_id,
      userId: user.id,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof miladyPlaidRouteDeps.MiladyPlaidConnectorError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create Plaid link token.",
      },
      { status: 500 },
    );
  }
}

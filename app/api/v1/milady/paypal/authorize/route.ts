import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { miladyPaypalRouteDeps } from "@/lib/services/milady-paypal-route-deps";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

/**
 * Returns the PayPal Login URL the client should redirect the user to.
 * Caller is responsible for round-tripping `state` through the redirect to
 * mitigate CSRF; we just echo whatever was supplied.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await miladyPaypalRouteDeps.requireAuthOrApiKeyWithOrg(
      request,
    );
    const { state } = (await request.json().catch(() => ({}))) as {
      state?: string;
    };
    if (!state || state.trim().length === 0) {
      return NextResponse.json(
        { error: "state is required for CSRF protection." },
        { status: 400 },
      );
    }
    const result = miladyPaypalRouteDeps.buildPaypalAuthorizeUrl({
      organizationId: user.organization_id,
      userId: user.id,
      state,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof miladyPaypalRouteDeps.MiladyPaypalConnectorError) {
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
            : "Failed to build PayPal authorize URL.",
      },
      { status: 500 },
    );
  }
}

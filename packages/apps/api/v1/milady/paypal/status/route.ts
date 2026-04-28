import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { miladyPaypalRouteDeps } from "@/lib/services/milady-paypal-route-deps";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET(request: NextRequest) {
  try {
    await miladyPaypalRouteDeps.requireAuthOrApiKeyWithOrg(request);
    return NextResponse.json({
      configured: miladyPaypalRouteDeps.isPaypalConfigured(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to read PayPal status.",
      },
      { status: 500 },
    );
  }
}

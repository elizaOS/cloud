import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { miladyPlaidRouteDeps } from "@/lib/services/milady-plaid-route-deps";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET(request: NextRequest) {
  try {
    await miladyPlaidRouteDeps.requireAuthOrApiKeyWithOrg(request);
    return NextResponse.json({
      configured: miladyPlaidRouteDeps.isPlaidConfigured(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to read Plaid status.",
      },
      { status: 500 },
    );
  }
}

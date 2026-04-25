import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { miladyPaypalRouteDeps } from "@/lib/services/milady-paypal-route-deps";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const requestSchema = z.object({
  refreshToken: z.string().trim().min(1),
});

export async function POST(request: NextRequest) {
  try {
    await miladyPaypalRouteDeps.requireAuthOrApiKeyWithOrg(request);
    const parsed = requestSchema.safeParse(
      await request.json().catch(() => ({})),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: "refreshToken is required.", details: parsed.error.issues },
        { status: 400 },
      );
    }
    const result = await miladyPaypalRouteDeps.refreshPaypalAccessToken(
      parsed.data,
    );
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
            : "Failed to refresh PayPal access token.",
      },
      { status: 500 },
    );
  }
}

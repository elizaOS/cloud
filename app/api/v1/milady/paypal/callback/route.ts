import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { miladyPaypalRouteDeps } from "@/lib/services/milady-paypal-route-deps";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const requestSchema = z.object({
  code: z.string().trim().min(1),
});

/**
 * Exchanges the PayPal `code` for an access + refresh token, fetches the
 * payer identity, and reports which capabilities (Reporting API vs identity
 * only) the granted scope unlocks. Personal-tier accounts typically only
 * grant identity → the caller should fall back to CSV import.
 */
export async function POST(request: NextRequest) {
  try {
    await miladyPaypalRouteDeps.requireAuthOrApiKeyWithOrg(request);
    const parsed = requestSchema.safeParse(
      await request.json().catch(() => ({})),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: "code is required.", details: parsed.error.issues },
        { status: 400 },
      );
    }
    const exchange = await miladyPaypalRouteDeps.exchangePaypalAuthorizationCode(
      { code: parsed.data.code },
    );
    let identity: Awaited<
      ReturnType<typeof miladyPaypalRouteDeps.getPaypalIdentity>
    > | null = null;
    try {
      identity = await miladyPaypalRouteDeps.getPaypalIdentity({
        accessToken: exchange.accessToken,
      });
    } catch {
      // Identity is optional — the auth itself is what matters.
    }
    const capability = miladyPaypalRouteDeps.describePaypalCapability(
      exchange.scope,
    );
    return NextResponse.json({
      accessToken: exchange.accessToken,
      refreshToken: exchange.refreshToken,
      expiresIn: exchange.expiresIn,
      scope: exchange.scope,
      capability,
      identity,
    });
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
            : "Failed to exchange PayPal authorization code.",
      },
      { status: 500 },
    );
  }
}

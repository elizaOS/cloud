import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { miladyPlaidRouteDeps } from "@/lib/services/milady-plaid-route-deps";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const requestSchema = z.object({
  publicToken: z.string().trim().min(1),
});

/**
 * Exchanges a Plaid Link `public_token` for a long-lived `access_token`
 * and returns institution + account metadata.
 *
 * The caller (Milady runtime) should persist the `accessToken` securely
 * server-side and key it to the local payment_source row. Never return the
 * raw `accessToken` to a browser client.
 */
export async function POST(request: NextRequest) {
  try {
    await miladyPlaidRouteDeps.requireAuthOrApiKeyWithOrg(request);
    const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "publicToken is required.", details: parsed.error.issues },
        { status: 400 },
      );
    }
    const exchange = await miladyPlaidRouteDeps.exchangePlaidPublicToken({
      publicToken: parsed.data.publicToken,
    });
    const info = await miladyPlaidRouteDeps.getPlaidItemInfo({
      accessToken: exchange.accessToken,
    });
    return NextResponse.json({
      accessToken: exchange.accessToken,
      itemId: exchange.itemId,
      institution: info,
    });
  } catch (error) {
    if (error instanceof miladyPlaidRouteDeps.MiladyPlaidConnectorError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to exchange Plaid public token.",
      },
      { status: 500 },
    );
  }
}

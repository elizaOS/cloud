import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { miladyPaypalRouteDeps } from "@/lib/services/milady-paypal-route-deps";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const requestSchema = z.object({
  accessToken: z.string().trim().min(1),
  startDate: z.string().trim().min(10),
  endDate: z.string().trim().min(10),
  page: z.number().int().min(1).max(50).optional(),
});

export async function POST(request: NextRequest) {
  try {
    await miladyPaypalRouteDeps.requireAuthOrApiKeyWithOrg(request);
    const parsed = requestSchema.safeParse(
      await request.json().catch(() => ({})),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid transactions request.", details: parsed.error.issues },
        { status: 400 },
      );
    }
    const result = await miladyPaypalRouteDeps.searchPaypalTransactions(
      parsed.data,
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof miladyPaypalRouteDeps.MiladyPaypalConnectorError) {
      // Surface the 403 "personal-tier" message clearly so the client can
      // route the user to the CSV-export fallback.
      return NextResponse.json(
        {
          error: error.message,
          fallback: error.status === 403 ? "csv_export" : null,
        },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to search PayPal transactions.",
      },
      { status: 500 },
    );
  }
}

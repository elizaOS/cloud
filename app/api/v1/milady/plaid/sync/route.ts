import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { miladyPlaidRouteDeps } from "@/lib/services/milady-plaid-route-deps";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const requestSchema = z.object({
  accessToken: z.string().trim().min(1),
  cursor: z.string().optional(),
  count: z.number().int().min(1).max(500).optional(),
});

/**
 * Forwards /transactions/sync to Plaid and returns the delta. The Milady
 * runtime caller should persist `nextCursor` per source so the next sync is
 * incremental.
 */
export async function POST(request: NextRequest) {
  try {
    await miladyPlaidRouteDeps.requireAuthOrApiKeyWithOrg(request);
    const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid sync request.", details: parsed.error.issues },
        { status: 400 },
      );
    }
    const delta = await miladyPlaidRouteDeps.syncPlaidTransactions(parsed.data);
    return NextResponse.json(delta);
  } catch (error) {
    if (error instanceof miladyPlaidRouteDeps.MiladyPlaidConnectorError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to sync Plaid transactions.",
      },
      { status: 500 },
    );
  }
}

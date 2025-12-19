import { type NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { requireAuthWithOrg } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/credits/balance
 * Gets the credit balance for the authenticated user's organization.
 *
 * Performance optimized: Uses organization data already fetched during auth
 * instead of making a redundant database call.
 *
 * @param req - The Next.js request object.
 * @returns JSON response with balance or error.
 */
export async function GET(req: NextRequest) {
  try {
    // requireAuthWithOrg already fetches organization with credit_balance
    // No need for additional DB call - use the data we already have
    const user = await requireAuthWithOrg();

    // Organization is guaranteed to exist since requireAuthWithOrg validates it
    const balance = Number(user.organization.credit_balance || 0);

    return NextResponse.json(
      { balance },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          Pragma: "no-cache",
          Expires: "0",
        },
      },
    );
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Failed to fetch balance";
    const isAuthError =
      msg.includes("Unauthorized") ||
      msg.includes("Authentication") ||
      msg.includes("Forbidden");

    if (isAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    logger.error("[Balance API] Error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

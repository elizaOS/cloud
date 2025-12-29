import { type NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { requireAuthWithOrg } from "@/lib/auth";
import { organizationsService } from "@/lib/services/organizations";

export const dynamic = "force-dynamic";

/**
 * GET /api/credits/balance
 * Gets the credit balance for the authenticated user's organization.
 *
 * Query params:
 * - fresh=true: Bypass cache and fetch directly from DB (use after payments)
 *
 * @param req - The Next.js request object.
 * @returns JSON response with balance or error.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthWithOrg();

    // Check if fresh data is requested (e.g., after payment)
    const forceFresh = req.nextUrl.searchParams.get("fresh") === "true";

    let balance: number;

    if (forceFresh) {
      // Fetch fresh from database - bypass session cache
      const freshOrg = await organizationsService.getById(user.organization_id);
      balance = Number(freshOrg?.credit_balance || 0);
    } else {
      // Use cached session data for normal polling (fast)
      balance = Number(user.organization.credit_balance || 0);
    }

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
    const errorMessage =
      error instanceof Error ? error.message : "Failed to fetch balance";
    const isAuthError =
      errorMessage.includes("Unauthorized") ||
      errorMessage.includes("Authentication") ||
      errorMessage.includes("Forbidden");

    if (isAuthError) {
      return NextResponse.json(
        { error: "Unauthorized" },
        {
          status: 401,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            Pragma: "no-cache",
            Expires: "0",
          },
        },
      );
    }

    logger.error("[Balance API] Error:", error);
    return NextResponse.json(
      { error: errorMessage },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          Pragma: "no-cache",
          Expires: "0",
        },
      },
    );
  }
}

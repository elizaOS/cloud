import { type NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { requireAuthWithOrg } from "@/lib/auth";
import { organizationsRepository } from "@/db/repositories";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/credits/balance
 * Gets the credit balance for the authenticated user's organization.
 *
 * @param req - The Next.js request object.
 * @returns JSON response with balance or error.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthWithOrg();
    const organizationId = user.organization_id!;

    const org = await organizationsRepository.findById(organizationId);
    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        {
          status: 404,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            Pragma: "no-cache",
            Expires: "0",
          },
        },
      );
    }

    const balance = Number(org.credit_balance || 0);

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

    // Return 401 for authentication errors
    const isAuthError =
      errorMessage.includes("Unauthorized") ||
      errorMessage.includes("Authentication required") ||
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

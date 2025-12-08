import { NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { usageQuotasService } from "@/lib/services/usage-quotas";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";

/**
 * GET /api/quotas/usage
 * Gets current quota usage statistics for the organization.
 *
 * @returns Current usage data across all quota types.
 */
async function handleGET() {
  try {
    const user = await requireAuthWithOrg();

    const usage = await usageQuotasService.getCurrentUsage(
      user.organization_id,
    );

    return NextResponse.json({
      success: true,
      data: usage,
    });
  } catch (error) {
    console.error("Error fetching quota usage:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch quota usage",
      },
      { status: 500 },
    );
  }
}

export const GET = withRateLimit(handleGET, RateLimitPresets.STANDARD);

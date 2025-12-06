import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { marketplaceService } from "@/lib/services";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/marketplace/categories
 * Gets all available character categories for the marketplace.
 *
 * @param request - The Next.js request object.
 * @returns Array of categories with character counts.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthWithOrg();

    logger.debug(
      "[Marketplace API] Getting categories for:",
      user.organization_id!,
    );

    const categories = await marketplaceService.getCategories(
      user.organization_id!,
      user.id,
    );

    return NextResponse.json({
      success: true,
      data: {
        categories,
      },
    });
  } catch (error) {
    logger.error("[Marketplace API] Error getting categories:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to get categories",
      },
      { status: 500 },
    );
  }
}

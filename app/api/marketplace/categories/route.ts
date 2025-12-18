import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { characterMarketplaceService } from "@/lib/services/characters/marketplace";
import { marketplaceCache } from "@/lib/cache/marketplace-cache";
import { logger } from "@/lib/utils/logger";

// Categories change infrequently - use ISR with 10 minute revalidation
export const revalidate = 600;

/**
 * GET /api/marketplace/categories
 * Gets all available character categories for the marketplace.
 * Response is cached for 10 minutes per organization.
 *
 * @param request - The Next.js request object.
 * @returns Array of categories with character counts.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthWithOrg();
    const organizationId = user.organization_id!;

    logger.debug(
      "[Marketplace API] Getting categories for:",
      organizationId,
    );

    // Try cache first
    let categories = await marketplaceCache.getCategories(organizationId);

    if (!categories) {
      // Cache miss - fetch from DB and cache
      categories = await characterMarketplaceService.getCategories(
        organizationId,
        user.id,
      );
      await marketplaceCache.setCategories(organizationId, categories);
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          categories,
        },
      },
      {
        headers: {
          "Cache-Control": "private, s-maxage=600, stale-while-revalidate=1200",
        },
      }
    );
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

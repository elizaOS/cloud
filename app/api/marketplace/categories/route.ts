import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { marketplaceService } from "@/lib/services/marketplace";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();

    logger.debug("[Marketplace API] Getting categories for:", user.organization_id);

    const categories = await marketplaceService.getCategories(
      user.organization_id,
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

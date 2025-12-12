import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { characterMarketplaceService } from "@/lib/services/characters/marketplace";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/marketplace/categories
 * 
 * @deprecated Use /api/my-agents/categories instead.
 * This endpoint is maintained for backwards compatibility.
 */
export async function GET(request: NextRequest) {
  const user = await requireAuthWithOrg();

  logger.debug("[Marketplace API] Getting categories for:", user.organization_id!);

  const categories = await characterMarketplaceService.getCategories(
    user.organization_id!,
    user.id,
  );

  return NextResponse.json({
    success: true,
    data: { categories },
  });
}

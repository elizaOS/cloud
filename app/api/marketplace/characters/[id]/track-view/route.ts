import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { characterMarketplaceService } from "@/lib/services/characters/marketplace";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/marketplace/characters/[id]/track-view
 *
 * @deprecated Use /api/my-agents/characters/[id]/track-view instead.
 * This endpoint is maintained for backwards compatibility.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAuth();
  const { id } = await params;

  logger.debug("[Marketplace API] Tracking view for character:", id);

  const result = await characterMarketplaceService.trackView(id);

  return NextResponse.json({
    success: result.success,
    data: { viewCount: result.count },
  });
}

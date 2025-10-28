import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { marketplaceService } from "@/lib/services/marketplace";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAuth();
    const { id } = await params;

    logger.debug("[Marketplace API] Tracking interaction for character:", id);

    const result = await marketplaceService.trackInteraction(id);

    return NextResponse.json({
      success: result.success,
      data: {
        interactionCount: result.count,
      },
    });
  } catch (error) {
    logger.error("[Marketplace API] Error tracking interaction:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to track interaction",
      },
      { status: 500 },
    );
  }
}

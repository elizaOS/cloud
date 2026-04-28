import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/api/cron-auth";
import { refreshPricingCatalog } from "@/lib/services/ai-pricing";
import { logger } from "@/lib/utils/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

async function handleRefresh(request: NextRequest) {
  try {
    const authError = verifyCronSecret(request, "[Pricing Cron]");
    if (authError) return authError;

    const refresh = await refreshPricingCatalog();

    logger.info("[Pricing Cron] Refreshed pricing catalog", {
      success: refresh.success,
      results: refresh.results,
    });

    return NextResponse.json({
      success: refresh.success,
      data: refresh,
    });
  } catch (error) {
    logger.error("[Pricing Cron] Failed", {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Pricing refresh failed",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return handleRefresh(request);
}

export async function POST(request: NextRequest) {
  return handleRefresh(request);
}

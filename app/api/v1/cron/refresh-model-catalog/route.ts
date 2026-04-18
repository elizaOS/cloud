import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/api/cron-auth";
import { cache } from "@/lib/cache/client";
import { refreshGatewayModelCatalog } from "@/lib/services/model-catalog";
import { logger } from "@/lib/utils/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handleRefresh(request: NextRequest) {
  try {
    const authError = verifyCronSecret(request, "[Model Catalog Cron]");
    if (authError) return authError;

    const cacheAvailable = cache.isAvailable();
    const models = await refreshGatewayModelCatalog();

    logger.info("[Model Catalog Cron] Refreshed model catalog", {
      modelCount: models.length,
      cacheAvailable,
    });

    return NextResponse.json({
      success: true,
      data: {
        modelCount: models.length,
        cacheAvailable,
        persisted: cacheAvailable,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error(
      "[Model Catalog Cron] Failed:",
      error instanceof Error ? error.message : String(error),
    );

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Model catalog refresh failed",
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

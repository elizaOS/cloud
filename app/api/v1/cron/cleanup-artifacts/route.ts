import { NextRequest, NextResponse } from "next/server";
import { cleanupAllArtifacts } from "@/lib/services/artifact-cleanup";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/cron/cleanup-artifacts
 * Cron endpoint to clean up old artifacts
 * 
 * Should be called by a cron service (e.g., Vercel Cron, GitHub Actions)
 * Secure with CRON_SECRET in production
 */
export async function POST(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      logger.warn("Unauthorized cron request", {
        ip: request.headers.get("x-forwarded-for"),
      });
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    logger.info("Starting scheduled artifact cleanup");

    const result = await cleanupAllArtifacts({
      maxVersionsPerProject: 10,
      maxAgeInDays: 90,
      minVersionsToKeep: 3,
    });

    logger.info("Scheduled artifact cleanup completed", result);

    return NextResponse.json({
      success: true,
      data: {
        deleted: result.totalDeleted,
        errors: result.totalErrors,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error(
      "Artifact cleanup cron failed",
      error instanceof Error ? error : new Error(String(error))
    );

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Cleanup failed",
      },
      { status: 500 }
    );
  }
}


import { NextRequest, NextResponse } from "next/server";
import { cleanupAllArtifacts } from "@/lib/services/artifact-cleanup";

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
    // SECURITY: Verify cron secret - MANDATORY in production
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    // CRITICAL: CRON_SECRET must be set - fail closed, not open
    if (!cronSecret) {
      console.error(
        "CRON_SECRET not configured - rejecting request for security",
      );
      return NextResponse.json(
        {
          success: false,
          error: "Server configuration error: CRON_SECRET not set",
        },
        { status: 500 },
      );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      console.warn("Unauthorized cron request", {
        ip: request.headers.get("x-forwarded-for"),
        timestamp: new Date().toISOString(),
      });
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 },
      );
    }

    console.log("Starting scheduled artifact cleanup");

    const result = await cleanupAllArtifacts({
      maxVersionsPerProject: 10,
      maxAgeInDays: 90,
      minVersionsToKeep: 3,
    });

    console.log("Scheduled artifact cleanup completed", result);

    return NextResponse.json({
      success: true,
      data: {
        deleted: result.totalDeleted,
        errors: result.totalErrors,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error(
      "Artifact cleanup cron failed",
      error instanceof Error ? error.message : String(error),
    );

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Cleanup failed",
      },
      { status: 500 },
    );
  }
}

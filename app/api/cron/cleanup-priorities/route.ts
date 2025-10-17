/**
 * Cron job to cleanup expired ALB priorities
 * Run this hourly to free up priorities from deleted containers
 * 
 * Vercel Cron: Add to vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/cleanup-priorities",
 *     "schedule": "0 * * * *"
 *   }]
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { dbPriorityManager } from "@/lib/services/alb-priority-manager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/cron/cleanup-priorities
 * Cleanup expired ALB priorities
 * Protected by CRON_SECRET
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error("CRON_SECRET not configured");
      return NextResponse.json(
        {
          success: false,
          error: "Cron jobs not configured",
        },
        { status: 503 }
      );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      console.error("Invalid cron secret");
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    console.log("🧹 Starting ALB priority cleanup cron job...");

    // Get stats before cleanup
    const statsBefore = await dbPriorityManager.getStats();
    console.log("Stats before cleanup:", statsBefore);

    // Run cleanup
    const deletedCount =
      await dbPriorityManager.cleanupExpiredPriorities();

    // Get stats after cleanup
    const statsAfter = await dbPriorityManager.getStats();
    console.log("Stats after cleanup:", statsAfter);

    console.log(
      `✅ ALB priority cleanup complete: ${deletedCount} priorities freed`
    );

    return NextResponse.json({
      success: true,
      data: {
        deleted_count: deletedCount,
        stats_before: statsBefore,
        stats_after: statsAfter,
      },
    });
  } catch (error) {
    console.error("Cron job error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Cleanup job failed",
      },
      { status: 500 }
    );
  }
}


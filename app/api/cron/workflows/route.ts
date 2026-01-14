/**
 * Cron endpoint for scheduled workflow execution
 *
 * This endpoint should be called every minute by Vercel Cron or similar.
 * It checks for workflows with schedule triggers and runs them if due.
 *
 * Add to vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/workflows",
 *     "schedule": "* * * * *"
 *   }]
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { workflowSchedulerService } from "@/lib/services/workflow-scheduler";
import { logger } from "@/lib/utils/logger";

// Vercel Cron secret for authentication
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  // Verify cron secret if configured
  if (CRON_SECRET) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      logger.warn("[Cron] Unauthorized cron request");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  logger.info("[Cron] Starting scheduled workflow check");

  const runs = await workflowSchedulerService.checkAndRunScheduledWorkflows();

  logger.info("[Cron] Scheduled workflow check completed", {
    executedCount: runs.length,
    successful: runs.filter((r) => r.result?.success).length,
    failed: runs.filter((r) => r.result && !r.result.success).length,
  });

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    executed: runs.length,
    runs: runs.map((r) => ({
      workflowId: r.workflowId,
      workflowName: r.workflowName,
      success: r.result?.success ?? false,
      error: r.result?.error,
    })),
  });
}

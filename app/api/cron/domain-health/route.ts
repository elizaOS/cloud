/**
 * Domain Health Check Cron Job
 *
 * Runs periodically to check domain health and SSL status.
 * Configure in vercel.json cron section.
 *
 * GET /api/cron/domain-health - Run health checks
 * POST /api/cron/domain-health - Run content scans (less frequent)
 */

import { NextRequest, NextResponse } from "next/server";
import { domainHealthMonitorService } from "@/lib/services/domain-health-monitor";
import { logger } from "@/lib/utils/logger";

// Verify cron secret to prevent unauthorized access
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    // In development, allow without secret
    return process.env.NODE_ENV === "development";
  }

  return authHeader === `Bearer ${cronSecret}`;
}

/**
 * GET /api/cron/domain-health
 * Run health checks (DNS, HTTP, SSL)
 * Should be scheduled every 6 hours
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  logger.info("[Cron] Starting domain health check job");

  const stats = await domainHealthMonitorService.runHealthChecks();

  logger.info("[Cron] Domain health check job complete", stats);

  return NextResponse.json({
    success: true,
    job: "domain-health-check",
    stats,
    timestamp: new Date().toISOString(),
  });
}

/**
 * POST /api/cron/domain-health
 * Run content scans (more expensive, slower)
 * Should be scheduled once daily
 */
export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  logger.info("[Cron] Starting domain content scan job");

  const stats = await domainHealthMonitorService.runContentScans();

  logger.info("[Cron] Domain content scan job complete", stats);

  return NextResponse.json({
    success: true,
    job: "domain-content-scan",
    stats,
    timestamp: new Date().toISOString(),
  });
}


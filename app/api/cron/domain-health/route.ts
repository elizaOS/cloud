import { NextRequest, NextResponse } from "next/server";
import { domainHealthMonitorService } from "@/lib/services/domain-health-monitor";
import { logger } from "@/lib/utils/logger";

const verifyCronSecret = (request: NextRequest) => {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return process.env.NODE_ENV === "development";
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
};

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


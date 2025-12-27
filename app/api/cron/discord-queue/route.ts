import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { discordEventRouter } from "@/lib/services/discord-gateway";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  logger.info("[Discord Queue Cron] Starting queue processing");

  const result = await discordEventRouter.processQueue(100);

  logger.info("[Discord Queue Cron] Queue processing complete", {
    processed: result.processed,
    failed: result.failed,
    durationMs: Date.now() - startTime,
  });

  return NextResponse.json({
    success: true,
    processed: result.processed,
    failed: result.failed,
    duration: Date.now() - startTime,
  });
}

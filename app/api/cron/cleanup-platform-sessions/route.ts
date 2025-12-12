import { NextRequest, NextResponse } from "next/server";
import { platformCredentialsService } from "@/lib/services/platform-credentials";
import { logger } from "@/lib/utils/logger";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const count = await platformCredentialsService.cleanupExpiredSessions();
  logger.info("[Cron] Platform sessions cleanup", { deletedCount: count });

  return NextResponse.json({ success: true, deletedCount: count });
}

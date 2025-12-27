import { NextRequest, NextResponse } from "next/server";
import { platformCredentialsService } from "@/lib/services/platform-credentials";
import { logger } from "@/lib/utils/logger";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await platformCredentialsService.refreshExpiringTokens(24);
  logger.info("[Cron] Token refresh complete", result);

  return NextResponse.json({ success: true, ...result });
}

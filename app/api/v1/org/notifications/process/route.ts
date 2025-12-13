import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { socialNotificationService } from "@/lib/services/social-feed/notifications";
import { logger } from "@/lib/utils/logger";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  logger.info("[API] Processing notifications", {
    organizationId: user.organization_id,
    userId: user.id,
  });

  const result = await socialNotificationService.processUnnotifiedEvents();

  return NextResponse.json({
    success: true,
    data: {
      processed: result.processed,
      successful: result.successful,
      failed: result.failed,
    },
  });
}

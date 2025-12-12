/**
 * Telegram Webhook Handler (Legacy Route)
 *
 * @deprecated Use /api/webhooks/telegram/[botId] instead
 * 
 * This route is kept for backwards compatibility but logs a warning.
 * New webhook setups should use the dynamic route with botId.
 */

import { NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";

export async function POST() {
  logger.warn("[Telegram Webhook] Request to deprecated endpoint /api/webhooks/telegram - use /api/webhooks/telegram/{botId} instead");
  
  // Return success to prevent Telegram from retrying
  return NextResponse.json({ 
    ok: true,
    warning: "This endpoint is deprecated. Please reconfigure your webhook to use /api/webhooks/telegram/{botId}"
  });
}

export async function GET() {
  return NextResponse.json({
    status: "deprecated",
    message: "Use /api/webhooks/telegram/{botId} instead",
    timestamp: new Date().toISOString(),
  });
}


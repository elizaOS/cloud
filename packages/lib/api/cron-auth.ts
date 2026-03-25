/**
 * Shared Cron Authentication Helper
 *
 * Centralizes cron auth logic to ensure consistent, fail-closed behavior:
 * - Returns 500 if CRON_SECRET is not configured (fail-safe)
 * - Uses timing-safe comparison to prevent timing attacks
 * - Returns a NextResponse on auth failure, or null on success
 */

import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";

/**
 * Verify the CRON_SECRET from the request Authorization header.
 *
 * @param request - The incoming request
 * @param logPrefix - Prefix for log messages (e.g., "[Container Billing]")
 * @returns null if auth succeeds, NextResponse error otherwise
 */
export function verifyCronSecret(
  request: NextRequest,
  logPrefix: string = "[Cron]",
): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    logger.error(`${logPrefix} CRON_SECRET not configured`);
    return NextResponse.json(
      { error: "Server configuration error: CRON_SECRET not set" },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization");
  const providedSecret = authHeader?.replace("Bearer ", "") || "";

  const expectedBuffer = Buffer.from(cronSecret, "utf8");
  const providedBuffer = Buffer.from(providedSecret, "utf8");

  const isValid =
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer);

  if (!isValid) {
    logger.warn(`${logPrefix} Unauthorized cron request`, {
      ip: request.headers.get("x-forwarded-for"),
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

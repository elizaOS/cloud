import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { cliAuthSessionsService } from "@/lib/services";

/**
 * Cron job to clean up expired CLI auth sessions
 * Should be called periodically (e.g., every hour)
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret using timing-safe comparison to prevent timing attacks
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error("CRON_SECRET not configured");
      return NextResponse.json(
        { error: "Cron not configured" },
        { status: 500 },
      );
    }

    const providedSecret = authHeader?.replace("Bearer ", "") || "";

    // Use timing-safe comparison to prevent timing attacks
    const providedBuffer = Buffer.from(providedSecret, "utf8");
    const secretBuffer = Buffer.from(cronSecret, "utf8");

    const isValidSecret =
      providedBuffer.length === secretBuffer.length &&
      timingSafeEqual(providedBuffer, secretBuffer);

    if (!isValidSecret) {
      console.error("Invalid cron secret");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Clean up expired sessions
    await cliAuthSessionsService.cleanupExpiredSessions();

    return NextResponse.json({
      success: true,
      message: "Expired CLI auth sessions cleaned up successfully",
    });
  } catch (error) {
    console.error("Error cleaning up CLI auth sessions:", error);
    return NextResponse.json(
      { error: "Failed to clean up sessions" },
      { status: 500 },
    );
  }
}

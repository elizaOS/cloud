import { NextRequest, NextResponse } from "next/server";
import { cliAuthSessionsService } from "@/lib/services";

/**
 * Cron job to clean up expired CLI auth sessions
 * Should be called periodically (e.g., every hour)
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
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

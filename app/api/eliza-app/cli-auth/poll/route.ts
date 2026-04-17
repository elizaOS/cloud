import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { cliAuthSessions } from "@/db/schemas/cli-auth-sessions";

/**
 * CLI polls this endpoint to check if the user has authenticated.
 * GET /api/eliza-app/cli-auth/poll?session_id=...
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("session_id");

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: "Missing session_id" },
        { status: 400 },
      );
    }

    const [session] = await db
      .select()
      .from(cliAuthSessions)
      .where(eq(cliAuthSessions.session_id, sessionId))
      .limit(1);

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Session not found" },
        { status: 404 },
      );
    }

    if (session.status === "expired" || new Date() > session.expires_at) {
      return NextResponse.json({ success: true, status: "expired" });
    }

    if (session.status === "authenticated") {
      // Return the token (stored temporarily in api_key_plain) and then mark as consumed/expired to prevent replay
      const token = session.api_key_plain;

      // Delete the plain key to secure it
      await db
        .update(cliAuthSessions)
        .set({ api_key_plain: null, status: "expired" })
        .where(eq(cliAuthSessions.session_id, sessionId));

      return NextResponse.json({
        success: true,
        status: "authenticated",
        token,
      });
    }

    return NextResponse.json({
      success: true,
      status: "pending",
    });
  } catch (error) {
    console.error("[CLI Auth Poll] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to poll session" },
      { status: 500 },
    );
  }
}

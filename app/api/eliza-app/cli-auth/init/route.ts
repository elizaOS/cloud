import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { cliAuthSessions } from "@/db/schemas/cli-auth-sessions";
import { v4 as uuidv4 } from "uuid";

/**
 * Creates a new pending CLI auth session.
 * POST /api/eliza-app/cli-auth/init
 */
export async function POST() {
  try {
    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    const [session] = await db
      .insert(cliAuthSessions)
      .values({
        session_id: sessionId,
        status: "pending",
        expires_at: expiresAt,
      })
      .returning();

    return NextResponse.json({
      success: true,
      session_id: session.session_id,
      expires_at: session.expires_at,
    });
  } catch (error) {
    console.error("[CLI Auth Init] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to initialize session" },
      { status: 500 }
    );
  }
}

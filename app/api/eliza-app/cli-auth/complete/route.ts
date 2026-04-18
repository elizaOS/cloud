import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { cliAuthSessions } from "@/db/schemas/cli-auth-sessions";
import { elizaAppSessionService } from "@/lib/services/eliza-app";

/**
 * Web UI calls this after successful login to bind the CLI session to the user.
 * POST /api/eliza-app/cli-auth/complete
 * Body: { session_id: "..." }
 * Headers: Authorization: Bearer <user_token>
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const userSession = await elizaAppSessionService.validateAuthHeader(authHeader);
    if (!userSession) {
      return NextResponse.json({ success: false, error: "Invalid session" }, { status: 401 });
    }

    const { session_id } = await request.json();
    if (!session_id) {
      return NextResponse.json({ success: false, error: "Missing session_id" }, { status: 400 });
    }

    const [cliSession] = await db
      .select()
      .from(cliAuthSessions)
      .where(eq(cliAuthSessions.session_id, session_id))
      .limit(1);

    if (!cliSession || cliSession.status !== "pending" || new Date() > cliSession.expires_at) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired CLI session" },
        { status: 400 },
      );
    }

    // We can generate a new long-lived token for the CLI or just use the current web token
    // For simplicity, we just pass the user's current token back to the CLI temporarily.
    // In production, we should provision an actual API key using `apiKeyService`.
    const tokenToPass = authHeader.split(" ")[1];

    await db
      .update(cliAuthSessions)
      .set({
        user_id: userSession.userId,
        status: "authenticated",
        authenticated_at: new Date(),
        api_key_plain: tokenToPass, // Passing the JWT via this temporary column
      })
      .where(eq(cliAuthSessions.session_id, session_id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CLI Auth Complete] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to complete CLI auth" },
      { status: 500 },
    );
  }
}

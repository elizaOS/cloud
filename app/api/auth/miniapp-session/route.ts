/**
 * POST /api/auth/miniapp-session
 * Creates a new miniapp authentication session.
 * Called by miniapps when a user wants to log in.
 * Returns a session ID and login URL for redirecting to Cloud authentication.
 *
 * @param request - Request body with callbackUrl and optional appId.
 * @returns Session ID, expiration, and login URL for redirect.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { miniappAuthSessionsService } from "@/lib/services/miniapp-auth-sessions";

const CreateSessionSchema = z.object({
  callbackUrl: z.string().url(),
  appId: z.string().optional(),
});

// CORS headers for miniapp requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = CreateSessionSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request", details: validation.error.format() },
        { status: 400, headers: corsHeaders },
      );
    }

    const { callbackUrl, appId } = validation.data;

    // Create new session
    const session = await miniappAuthSessionsService.createSession(
      callbackUrl,
      appId,
    );

    return NextResponse.json(
      {
        sessionId: session.sessionId,
        expiresAt: session.expiresAt,
        // URL where miniapp should redirect the user
        loginUrl: `${process.env.NEXT_PUBLIC_APP_URL || ""}/auth/miniapp-login?session=${session.sessionId}`,
      },
      { status: 201, headers: corsHeaders },
    );
  } catch (error) {
    console.error("Error creating miniapp auth session:", error);
    return NextResponse.json(
      { error: "Failed to create authentication session" },
      { status: 500, headers: corsHeaders },
    );
  }
}

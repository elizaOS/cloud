/**
 * GET /api/auth/miniapp-session/[sessionId]
 * Get the status of a miniapp authentication session
 * 
 * Called by miniapp to poll for authentication completion.
 * If status is "authenticated", returns the auth token.
 */

import { NextRequest, NextResponse } from "next/server";
import { miniappAuthSessionsService } from "@/lib/services/miniapp-auth-sessions";

// CORS headers for miniapp requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400, headers: corsHeaders }
      );
    }

    const status = await miniappAuthSessionsService.getSessionStatus(sessionId);

    if (status.status === "not_found") {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    if (status.status === "expired") {
      return NextResponse.json(
        { error: "Session expired" },
        { status: 410, headers: corsHeaders }
      );
    }

    // If authenticated, return the auth token (one-time retrieval)
    if (status.status === "authenticated") {
      const tokenData = await miniappAuthSessionsService.getAuthToken(sessionId);

      if (!tokenData) {
        return NextResponse.json({
          status: "authenticated",
          message: "Token already retrieved",
        }, { headers: corsHeaders });
      }

      return NextResponse.json({
        status: "authenticated",
        authToken: tokenData.authToken,
        userId: tokenData.userId,
        organizationId: tokenData.organizationId,
      }, { headers: corsHeaders });
    }

    // Still pending
    return NextResponse.json({
      status: status.status,
    }, { headers: corsHeaders });
  } catch (error) {
    console.error("Error getting miniapp auth session:", error);
    return NextResponse.json(
      { error: "Failed to get session status" },
      { status: 500, headers: corsHeaders }
    );
  }
}


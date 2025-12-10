/**
 * Credential Session Status API
 *
 * GET /api/v1/credentials/session/[sessionId] - Get link session status
 *
 * Used by apps to poll for completion of OAuth flow.
 */

import { NextRequest, NextResponse } from "next/server";
import { platformCredentialsService } from "@/lib/services/platform-credentials";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  const status = await platformCredentialsService.getSessionStatus(sessionId);

  return NextResponse.json(status);
}


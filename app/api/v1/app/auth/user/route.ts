/**
 * App Auth User Endpoint - Returns authenticated user for app SDK.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { addCorsHeaders, validateOrigin, createPreflightResponse } from "@/lib/middleware/cors-apps";

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return createPreflightResponse(origin, ["GET", "OPTIONS"]);
}

export async function GET(request: NextRequest) {
  const corsResult = await validateOrigin(request);

  try {
    const { user, organization } = await requireAuthOrApiKeyWithOrg(request);
    
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        nickname: user.nickname,
        avatar: user.avatar,
        walletAddress: user.wallet_address,
        organizationId: organization.id,
      },
    });

    return addCorsHeaders(response, corsResult.origin);
  } catch {
    const response = NextResponse.json({ success: false, user: null }, { status: 401 });
    return addCorsHeaders(response, corsResult.origin);
  }
}

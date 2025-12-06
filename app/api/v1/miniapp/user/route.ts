import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { addCorsHeaders, validateOrigin, createPreflightResponse } from "@/lib/middleware/cors-apps";
import { 
  checkMiniappRateLimit, 
  createRateLimitErrorResponse, 
  addRateLimitInfoToResponse,
  MINIAPP_RATE_LIMITS,
} from "@/lib/middleware/miniapp-rate-limit";
import { logger } from "@/lib/utils/logger";

/**
 * OPTIONS /api/v1/miniapp/user
 * CORS preflight handler for miniapp user endpoint.
 *
 * @param request - The Next.js request object.
 * @returns Preflight response with CORS headers.
 */
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return createPreflightResponse(origin, ["GET", "OPTIONS"]);
}

/**
 * GET /api/v1/miniapp/user
 * Returns the current authenticated user's information for miniapp consumption.
 * Supports both API key and session authentication with CORS and rate limiting.
 *
 * @param request - The Next.js request object.
 * @returns User information including organization details.
 */
export async function GET(request: NextRequest) {
  const corsResult = await validateOrigin(request);
  
  // Rate limiting
  const rateLimitResult = await checkMiniappRateLimit(request, MINIAPP_RATE_LIMITS);
  if (!rateLimitResult.allowed) {
    return createRateLimitErrorResponse(rateLimitResult, corsResult.origin ?? undefined);
  }
  
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        nickname: user.nickname,
        avatar: user.avatar,
        walletAddress: user.wallet_address,
        walletChainType: user.wallet_chain_type,
        createdAt: user.created_at,
      },
      organization: {
        id: user.organization_id,
        name: user.organization?.name,
        creditBalance: user.organization?.credit_balance,
      },
    });
    
    addRateLimitInfoToResponse(response, rateLimitResult);
    return addCorsHeaders(response, corsResult.origin);
  } catch (error) {
    logger.error("[Miniapp API] Error getting user", { error });
    
    const status = error instanceof Error && error.message.includes("Unauthorized") 
      ? 401 
      : error instanceof Error && error.message.includes("Forbidden")
        ? 403
        : 500;
    
    const response = NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get user",
      },
      { status }
    );
    
    return addCorsHeaders(response, corsResult.origin);
  }
}


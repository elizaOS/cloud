/**
 * /api/v1/miniapp/billing
 * 
 * GET - Get billing/credits info for the authenticated user's organization
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { organizationsService, creditsService, usageService } from "@/lib/services";
import { addCorsHeaders, validateOrigin, createPreflightResponse } from "@/lib/middleware/cors-apps";
import { 
  checkMiniappRateLimit, 
  createRateLimitErrorResponse, 
  addRateLimitInfoToResponse,
  MINIAPP_RATE_LIMITS,
} from "@/lib/middleware/miniapp-rate-limit";
import { logger } from "@/lib/utils/logger";

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return createPreflightResponse(origin, ["GET", "OPTIONS"]);
}

/**
 * GET /api/v1/miniapp/billing
 * Get billing and credits info
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
    
    // Get organization with credit balance
    const org = await organizationsService.getById(user.organization_id);
    
    if (!org) {
      const response = NextResponse.json(
        { success: false, error: "Organization not found" },
        { status: 404 }
      );
      return addCorsHeaders(response, corsResult.origin);
    }
    
    // Get recent credit transactions
    const recentTransactions = await creditsService.listTransactionsByOrganization(
      user.organization_id,
      10 // Last 10 transactions
    );
    
    // Get usage summary for the current month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const usageStats = await usageService.getStatsByOrganization(
      user.organization_id,
      startOfMonth,
      now
    );
    
    // Get usage breakdown by model
    const usageByModel = await usageService.getByModel(
      user.organization_id,
      startOfMonth,
      now
    );
    
    const response = NextResponse.json({
      success: true,
      billing: {
        creditBalance: org.credit_balance,
        autoTopUpEnabled: org.auto_top_up_enabled,
        autoTopUpThreshold: org.auto_top_up_threshold,
        autoTopUpAmount: org.auto_top_up_amount,
        billingEmail: org.billing_email,
        hasPaymentMethod: !!org.stripe_customer_id, // Don't expose actual ID
      },
      usage: {
        currentMonth: {
          totalRequests: usageStats?.totalRequests || 0,
          totalCost: usageStats?.totalCost || "0.00",
          totalTokens: (usageStats?.totalInputTokens || 0) + (usageStats?.totalOutputTokens || 0),
          breakdown: usageByModel || [],
        },
      },
      recentTransactions: recentTransactions.map((tx) => ({
        id: tx.id,
        type: tx.type,
        amount: tx.amount,
        description: tx.description,
        createdAt: tx.created_at,
      })),
    });
    
    addRateLimitInfoToResponse(response, rateLimitResult);
    return addCorsHeaders(response, corsResult.origin);
  } catch (error) {
    logger.error("[Miniapp API] Error getting billing info", { error });
    
    const status = error instanceof Error && error.message.includes("Unauthorized") ? 401 : 500;
    const response = NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to get billing info" },
      { status }
    );
    
    return addCorsHeaders(response, corsResult.origin);
  }
}


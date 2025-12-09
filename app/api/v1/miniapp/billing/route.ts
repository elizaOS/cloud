/**
 * /api/v1/miniapp/billing
 *
 * GET - Get billing/credits info for the authenticated user's organization
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { organizationsService } from "@/lib/services/organizations";
import { creditsService } from "@/lib/services/credits";
import { usageService } from "@/lib/services/usage";
import { appCreditsService } from "@/lib/services/app-credits";
import { appsService } from "@/lib/services/apps";
import {
  addCorsHeaders,
  validateOrigin,
  createPreflightResponse,
} from "@/lib/middleware/cors-apps";
import {
  checkMiniappRateLimit,
  createRateLimitErrorResponse,
  addRateLimitInfoToResponse,
  MINIAPP_RATE_LIMITS,
} from "@/lib/middleware/miniapp-rate-limit";
import { logger } from "@/lib/utils/logger";

/**
 * OPTIONS /api/v1/miniapp/billing
 * CORS preflight handler for miniapp billing endpoint.
 *
 * @param request - The Next.js request object.
 * @returns Preflight response with CORS headers.
 */
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return createPreflightResponse(origin, ["GET", "OPTIONS"]);
}

/**
 * GET /api/v1/miniapp/billing
 * Gets billing and credits information for the authenticated user's organization.
 * Optionally includes app-specific billing if appId is provided (for monetized apps).
 *
 * Query Parameters:
 * - `appId` (optional): Returns app-specific credit balance for monetized apps.
 *
 * @param request - Request with optional appId query parameter or X-App-Id header.
 * @returns Billing information including credit balance, usage stats, and recent transactions.
 */
export async function GET(request: NextRequest) {
  const corsResult = await validateOrigin(request);

  // Rate limiting
  const rateLimitResult = await checkMiniappRateLimit(
    request,
    MINIAPP_RATE_LIMITS,
  );
  if (!rateLimitResult.allowed) {
    return createRateLimitErrorResponse(
      rateLimitResult,
      corsResult.origin ?? undefined,
    );
  }

  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);

    // Check for app-specific billing - from query param OR X-App-Id header
    const queryAppId = request.nextUrl.searchParams.get("appId");
    const headerAppId = request.headers.get("X-App-Id");
    const appId = queryAppId || headerAppId;

    // Get organization with credit balance
    const org = await organizationsService.getById(user.organization_id);

    if (!org) {
      const response = NextResponse.json(
        { success: false, error: "Organization not found" },
        { status: 404 },
      );
      return addCorsHeaders(response, corsResult.origin);
    }

    // Get recent credit transactions
    const recentTransactions =
      await creditsService.listTransactionsByOrganization(
        user.organization_id,
        10, // Last 10 transactions
      );

    // Get usage summary for the current month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const usageStats = await usageService.getStatsByOrganization(
      user.organization_id,
      startOfMonth,
      now,
    );

    // Get usage breakdown by model
    const usageByModel = await usageService.getByModel(
      user.organization_id,
      startOfMonth,
      now,
    );

    // Build base response
    const responseData: Record<string, unknown> = {
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
          totalTokens:
            (usageStats?.totalInputTokens || 0) +
            (usageStats?.totalOutputTokens || 0),
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
    };

    // If appId is provided, add app-specific billing info
    if (appId) {
      try {
        const app = await appsService.getById(appId);

        if (app && app.monetization_enabled) {
          const appBalance = await appCreditsService.getBalance(
            appId,
            user.id,
          );
          const monetizationSettings =
            await appCreditsService.getMonetizationSettings(appId);

          responseData.appBilling = {
            appId,
            appName: app.name,
            monetizationEnabled: app.monetization_enabled,
            creditBalance: appBalance?.balance || 0,
            totalPurchased: appBalance?.totalPurchased || 0,
            totalSpent: appBalance?.totalSpent || 0,
            // Pricing info for user transparency
            inferenceMarkupPercentage:
              monetizationSettings?.inferenceMarkupPercentage || 0,
            // Creator attribution
            createdBy: {
              organizationId: app.organization_id,
            },
          };
        } else if (app) {
          // App exists but doesn't have monetization enabled
          // User uses their regular org balance
          responseData.appBilling = {
            appId,
            appName: app.name,
            monetizationEnabled: false,
            // User uses org balance
            useOrgBalance: true,
          };
        }
      } catch (appError) {
        logger.error("[Miniapp API] Error getting app billing info", {
          appError,
          appId,
        });
        // Don't fail the whole request, just don't include app billing
      }
    }

    const response = NextResponse.json(responseData);

    addRateLimitInfoToResponse(response, rateLimitResult);
    return addCorsHeaders(response, corsResult.origin);
  } catch (error) {
    logger.error("[Miniapp API] Error getting billing info", { error });

    const status =
      error instanceof Error && error.message.includes("Unauthorized")
        ? 401
        : 500;
    const response = NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to get billing info",
      },
      { status },
    );

    return addCorsHeaders(response, corsResult.origin);
  }
}

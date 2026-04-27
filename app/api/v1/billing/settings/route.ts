/**
 * Billing Settings API (v1)
 *
 * GET/PUT /api/v1/billing/settings
 * Manage auto-top-up and billing settings.
 * Supports both Privy session and API key authentication.
 *
 * WHY THIS EXISTS:
 * ----------------
 * 1. AUTONOMOUS AGENT CONTINUITY: AI agents operating 24/7 need uninterrupted access
 *    to credits. Auto-top-up configured via API ensures agents never stop working
 *    due to insufficient balance - they can configure their own billing preferences.
 *
 * 2. PROGRAMMATIC BILLING MANAGEMENT: Developers managing multiple organizations or
 *    building billing dashboards need API access to configure auto-top-up settings
 *    without manual intervention through the UI.
 *
 * 3. SELF-MANAGING AGENTS: An AI agent can monitor its own credit usage and configure
 *    auto-top-up thresholds appropriately based on its workload - true autonomy.
 *
 * AUTO-TOP-UP BEHAVIOR:
 * - When balance falls below threshold, charges the saved payment method
 * - Requires a saved payment method (Stripe) to be configured first
 * - Amount and threshold are configurable within platform limits ($1-$1000)
 * - Failed charges disable auto-top-up and notify the user
 */

import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { organizationsRepository } from "@/db/repositories";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { RateLimitPresets, withRateLimit } from "@/lib/middleware/rate-limit";
import { AUTO_TOP_UP_LIMITS, autoTopUpService } from "@/lib/services/auto-top-up";
import { logger } from "@/lib/utils/logger";

const UpdateSettingsSchema = z.object({
  autoTopUp: z
    .object({
      enabled: z.boolean().optional(),
      amount: z
        .number()
        .min(AUTO_TOP_UP_LIMITS.MIN_AMOUNT)
        .max(AUTO_TOP_UP_LIMITS.MAX_AMOUNT)
        .optional(),
      threshold: z
        .number()
        .min(AUTO_TOP_UP_LIMITS.MIN_THRESHOLD)
        .max(AUTO_TOP_UP_LIMITS.MAX_THRESHOLD)
        .optional(),
    })
    .optional(),
  payAsYouGoFromEarnings: z.boolean().optional(),
});

/**
 * Detect authentication/authorization errors by status code rather than
 * fragile string matching on error messages.
 */
function isAuthenticationError(error: unknown): boolean {
  if (error != null && typeof error === "object") {
    const status = (error as { status?: number }).status;
    if (status === 401 || status === 403) return true;
  }
  // ApiError (from @/lib/api/errors) carries .status
  if (error instanceof Error && "status" in error) {
    const status = (error as Error & { status?: number }).status;
    if (status === 401 || status === 403) return true;
  }
  return false;
}

/**
 * GET /api/v1/billing/settings
 * Gets billing settings for the authenticated user's organization.
 * Includes auto-top-up configuration and payment method status.
 *
 * @param req - The Next.js request object.
 * @returns Billing settings including auto-top-up configuration.
 */
async function handleGET(req: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(req);

    const [autoTopUpSettings, org] = await Promise.all([
      autoTopUpService.getSettings(user.organization_id),
      organizationsRepository.findById(user.organization_id),
    ]);

    return NextResponse.json({
      success: true,
      settings: {
        autoTopUp: {
          enabled: autoTopUpSettings.enabled,
          amount: autoTopUpSettings.amount,
          threshold: autoTopUpSettings.threshold,
          hasPaymentMethod: autoTopUpSettings.hasPaymentMethod,
        },
        payAsYouGoFromEarnings: org?.pay_as_you_go_from_earnings ?? true,
        limits: {
          minAmount: AUTO_TOP_UP_LIMITS.MIN_AMOUNT,
          maxAmount: AUTO_TOP_UP_LIMITS.MAX_AMOUNT,
          minThreshold: AUTO_TOP_UP_LIMITS.MIN_THRESHOLD,
          maxThreshold: AUTO_TOP_UP_LIMITS.MAX_THRESHOLD,
        },
      },
    });
  } catch (error) {
    logger.error("[Billing Settings API] Error getting settings:", error);

    if (isAuthenticationError(error)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      { success: false, error: "Failed to get billing settings" },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/v1/billing/settings
 * Updates billing settings for the authenticated user's organization.
 * Supports updating auto-top-up configuration.
 *
 * Request Body:
 * - autoTopUp.enabled: Enable/disable auto-top-up
 * - autoTopUp.amount: Amount to charge when triggered ($1-$1000)
 * - autoTopUp.threshold: Balance threshold to trigger top-up ($0-$1000)
 *
 * @param req - The Next.js request object with settings to update.
 * @returns Updated billing settings.
 */
async function handlePUT(req: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(req);

    const body = await req.json();
    const validation = UpdateSettingsSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request data",
          details: validation.error.format(),
        },
        { status: 400 },
      );
    }

    const { autoTopUp, payAsYouGoFromEarnings } = validation.data;

    if (autoTopUp) {
      await autoTopUpService.updateSettings(user.organization_id, {
        enabled: autoTopUp.enabled,
        amount: autoTopUp.amount,
        threshold: autoTopUp.threshold,
      });

      logger.info("[Billing Settings API] Updated auto-top-up settings", {
        organizationId: user.organization_id,
        userId: user.id,
        settings: autoTopUp,
      });
    }

    if (payAsYouGoFromEarnings !== undefined) {
      await organizationsRepository.update(user.organization_id, {
        pay_as_you_go_from_earnings: payAsYouGoFromEarnings,
        updated_at: new Date(),
      });

      logger.info("[Billing Settings API] Updated pay-as-you-go toggle", {
        organizationId: user.organization_id,
        userId: user.id,
        enabled: payAsYouGoFromEarnings,
      });
    }

    const [updatedSettings, org] = await Promise.all([
      autoTopUpService.getSettings(user.organization_id),
      organizationsRepository.findById(user.organization_id),
    ]);

    return NextResponse.json({
      success: true,
      message: "Billing settings updated successfully",
      settings: {
        autoTopUp: {
          enabled: updatedSettings.enabled,
          amount: updatedSettings.amount,
          threshold: updatedSettings.threshold,
          hasPaymentMethod: updatedSettings.hasPaymentMethod,
        },
        payAsYouGoFromEarnings: org?.pay_as_you_go_from_earnings ?? true,
      },
    });
  } catch (error) {
    logger.error("[Billing Settings API] Error updating settings:", error);

    if (isAuthenticationError(error)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    // Allow domain-specific validation messages through (e.g. "Cannot enable
    // auto-top-up without a payment method") since they don't leak internals.
    const message = error instanceof Error ? error.message : "";
    const isValidationError =
      message.includes("Cannot enable") ||
      message.includes("must be") ||
      message.includes("cannot exceed");

    return NextResponse.json(
      {
        success: false,
        error: isValidationError ? message : "Failed to update billing settings",
      },
      { status: isValidationError ? 400 : 500 },
    );
  }
}

export const GET = withRateLimit(handleGET, RateLimitPresets.STANDARD);
export const PUT = withRateLimit(handlePUT, RateLimitPresets.STANDARD);

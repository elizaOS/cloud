import { type NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import {
  autoTopUpService,
  AUTO_TOP_UP_LIMITS,
} from "@/lib/services/auto-top-up";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { z } from "zod";

const updateSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  amount: z
    .number()
    .min(
      AUTO_TOP_UP_LIMITS.MIN_AMOUNT,
      `Amount must be at least $${AUTO_TOP_UP_LIMITS.MIN_AMOUNT}`,
    )
    .max(
      AUTO_TOP_UP_LIMITS.MAX_AMOUNT,
      `Amount cannot exceed $${AUTO_TOP_UP_LIMITS.MAX_AMOUNT}`,
    )
    .finite("Amount must be a valid number")
    .optional(),
  threshold: z
    .number()
    .min(
      AUTO_TOP_UP_LIMITS.MIN_THRESHOLD,
      `Threshold must be at least $${AUTO_TOP_UP_LIMITS.MIN_THRESHOLD}`,
    )
    .max(
      AUTO_TOP_UP_LIMITS.MAX_THRESHOLD,
      `Threshold cannot exceed $${AUTO_TOP_UP_LIMITS.MAX_THRESHOLD}`,
    )
    .finite("Threshold must be a valid number")
    .optional(),
});

/**
 * GET /api/auto-top-up/settings
 * Gets auto top-up settings for the authenticated user's organization.
 *
 * @param req - The Next.js request object.
 * @returns Auto top-up settings including enabled status, amount, and threshold.
 */
async function handleGetSettings(req: NextRequest) {
  try {
    const user = await requireAuthWithOrg();

    const settings = await autoTopUpService.getSettings(user.organization_id!);

    return NextResponse.json(settings);
  } catch (error) {
    console.error("Error getting auto top-up settings:", error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: error.message.includes("not found") ? 404 : 500 },
      );
    }

    return NextResponse.json(
      { error: "Failed to get auto top-up settings" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/auto-top-up/settings
 * Updates auto top-up settings for the authenticated user's organization.
 *
 * @param req - Request body with optional enabled, amount, and threshold fields.
 * @returns Updated auto top-up settings.
 */
async function handleUpdateSettings(req: NextRequest) {
  try {
    const user = await requireAuthWithOrg();

    const body = await req.json();
    const validationResult = updateSettingsSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const settings = validationResult.data;

    // Additional validation: if no fields provided, return error
    if (
      settings.enabled === undefined &&
      settings.amount === undefined &&
      settings.threshold === undefined
    ) {
      return NextResponse.json(
        { error: "At least one setting must be provided" },
        { status: 400 },
      );
    }

    await autoTopUpService.updateSettings(user.organization_id!, settings);

    // Get updated settings to return
    const updatedSettings = await autoTopUpService.getSettings(
      user.organization_id!,
    );

    return NextResponse.json({
      success: true,
      message: "Auto top-up settings updated successfully",
      settings: updatedSettings,
    });
  } catch (error) {
    console.error("Error updating auto top-up settings:", error);

    if (error instanceof Error) {
      // Check for specific error types
      if (error.message.includes("without a default payment method")) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      if (error.message.includes("not found")) {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }

      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: "Failed to update auto top-up settings" },
      { status: 500 },
    );
  }
}

// Export rate-limited handlers
export const GET = withRateLimit(handleGetSettings, RateLimitPresets.STANDARD);
export const POST = withRateLimit(
  handleUpdateSettings,
  RateLimitPresets.STRICT,
);

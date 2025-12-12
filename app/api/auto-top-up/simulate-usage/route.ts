import { type NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { requireAuthWithOrg } from "@/lib/auth";
import { creditsService } from "@/lib/services/credits";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";

/**
 * POST /api/auto-top-up/simulate-usage
 * Simulates credit usage by deducting a specified amount from the organization's balance.
 * Used for testing auto top-up functionality.
 * Rate limited: Strict preset.
 *
 * @param req - Request body with optional amount (default: $2.00, max: $100.00).
 * @returns Deduction result with new balance.
 */
async function handleSimulateUsage(req: NextRequest) {
  try {
    const user = await requireAuthWithOrg();
    const organizationId = user.organization_id!;

    const body = await req.json();
    const amount = body.amount || 2.0;

    if (amount <= 0 || amount > 100) {
      return NextResponse.json(
        { error: "Amount must be between $0.01 and $100" },
        { status: 400 },
      );
    }

    logger.info("[SimulateUsage] Deducting credits", { amount: amount.toFixed(2), organizationId });

    const result = await creditsService.deductCredits({
      organizationId,
      amount,
      description: "Simulated usage for auto top-up testing",
      metadata: {
        type: "test",
        source: "simulate_usage_button",
      },
    });

    if (!result.success) {
      return NextResponse.json(
        {
          error: "Insufficient credits",
          message: "Not enough credits to simulate usage",
          currentBalance: result.newBalance,
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      message: `Deducted $${amount.toFixed(2)} from your balance`,
      amountDeducted: amount,
      newBalance: result.newBalance,
    });
  } catch (error) {
    logger.error("[SimulateUsage] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to simulate usage",
      },
      { status: 500 },
    );
  }
}

export const POST = withRateLimit(handleSimulateUsage, RateLimitPresets.STRICT);

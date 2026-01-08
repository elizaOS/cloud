import { creditsService } from "@/lib/services/credits";
import { calculateCost, getProviderFromModel } from "@/lib/pricing";
import { logger } from "@/lib/utils/logger";
import {
  COST_BUFFER,
  MIN_RESERVATION,
  DEFAULT_OUTPUT_TOKENS,
  InsufficientCreditsError,
} from "./types";
import type { CreditReservation, ReserveCreditsParams } from "./types";

/**
 * Reserve credits before an operation.
 * - If `amount` is provided: fixed cost (images, videos, etc.)
 * - If `model` is provided: estimates cost from tokens with 50% buffer
 */
export async function reserveCredits(
  params: ReserveCreditsParams,
): Promise<CreditReservation> {
  const { organizationId, userId, description } = params;

  // Calculate reserved amount based on mode
  let reservedAmount: number;
  let model: string | undefined;

  if (params.amount !== undefined) {
    // Fixed cost mode
    reservedAmount = params.amount;
  } else if (params.model) {
    // Token estimation mode
    model = params.model;
    const provider = params.provider ?? getProviderFromModel(params.model);
    const estimatedInputTokens = params.estimatedInputTokens ?? 0;
    const estimatedOutputTokens =
      params.estimatedOutputTokens ?? DEFAULT_OUTPUT_TOKENS;

    const { totalCost: estimatedCost } = await calculateCost(
      params.model,
      provider,
      estimatedInputTokens,
      estimatedOutputTokens,
    );

    reservedAmount = Math.max(estimatedCost * COST_BUFFER, MIN_RESERVATION);
  } else {
    throw new Error("reserveCredits requires either `amount` or `model`");
  }

  // Reserve atomically with SELECT FOR UPDATE
  const result = await creditsService.reserveAndDeductCredits({
    organizationId,
    amount: reservedAmount,
    description: `${description} (reserved)`,
    metadata: {
      user_id: userId,
      type: "reservation",
      ...(model && { model }),
    },
  });

  if (!result.success) {
    logger.warn("[Billing] Insufficient credits", {
      organizationId,
      required: reservedAmount,
      reason: result.reason,
    });
    throw new InsufficientCreditsError(reservedAmount, result.reason);
  }

  logger.info("[Billing] Credits reserved", {
    organizationId,
    reservedAmount,
    ...(model && { model }),
  });

  return {
    reservedAmount,
    reconcile: async (actualCost: number) => {
      await creditsService.reconcile({
        organizationId,
        reservedAmount,
        actualCost,
        description,
        metadata: { user_id: userId, ...(model && { model }) },
      });
    },
  };
}

/**
 * Create a no-op reservation for anonymous users.
 */
export function createAnonymousReservation(): CreditReservation {
  return {
    reservedAmount: 0,
    reconcile: async () => {},
  };
}

/**
 * MCP Credit Reservation Helper
 */

import {
  creditsService,
  InsufficientCreditsError,
  type CreditReservation,
} from "@/lib/services/credits";
import { getAuthContext } from "./context";
import { errorResponse } from "./responses";

export { InsufficientCreditsError, type CreditReservation };

export async function reserveCredits(amount: number, description: string) {
  const { user } = getAuthContext();

  try {
    return await creditsService.reserve({
      organizationId: user.organization_id,
      amount,
      userId: user.id,
      description,
    });
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      return null;
    }
    throw error;
  }
}

export async function withCreditReservation<T>(
  amount: number,
  description: string,
  operation: () => Promise<{ result: T; actualCost: number }>,
): Promise<
  | { success: true; result: T }
  | { success: false; error: ReturnType<typeof errorResponse> }
> {
  const reservation = await reserveCredits(amount, description);

  if (!reservation) {
    return {
      success: false,
      error: errorResponse("Insufficient credits", { required: amount }),
    };
  }

  try {
    const { result, actualCost } = await operation();
    await reservation.reconcile(actualCost);
    return { success: true, result };
  } catch (error) {
    await reservation.reconcile(0);
    throw error;
  }
}

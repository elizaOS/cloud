export const COST_BUFFER = 1.5;
export const MIN_RESERVATION = 0.01;
export const DEFAULT_OUTPUT_TOKENS = 500;

export interface CreditReservation {
  reservedAmount: number;
  reconcile: (actualCost: number) => Promise<void>;
}

/**
 * Params for reserving credits.
 * - If `amount` is provided: fixed cost reservation (images, videos, etc.)
 * - If `model` is provided: token-based estimation (chat, embeddings, etc.)
 */
export interface ReserveCreditsParams {
  organizationId: string;
  userId?: string;
  description: string;
  amount?: number;
  model?: string;
  provider?: string;
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
}

export class InsufficientCreditsError extends Error {
  constructor(
    public readonly required: number,
    public readonly reason?: string,
  ) {
    super(`Insufficient credits. Required: $${required.toFixed(4)}`);
    this.name = "InsufficientCreditsError";
  }
}

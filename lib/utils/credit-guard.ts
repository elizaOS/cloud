/**
 * Credit Guard Utility
 * Provides a reusable pattern for credit deduction, generation execution, and automatic refunds on failure
 */

import {
  creditsService,
  usageService,
  organizationsService,
} from "@/lib/services";

interface CreditMetadata {
  user_id: string;
  [key: string]: string | number | boolean | undefined | null;
}

interface GenerationResult<T> {
  success: boolean;
  result?: T;
  error?: string;
  actualCost?: number;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

interface CreditGuardParams<T> {
  organizationId: string;
  estimatedCost: number;
  description: string;
  metadata: CreditMetadata;
  execute: () => Promise<T>;
  calculateActualCost?: (result: T) => Promise<number>;
  onSuccess?: (result: T) => Promise<void>;
}

interface UsageRecordParams {
  organization_id: string;
  user_id: string;
  api_key_id?: string | null;
  type: string;
  model: string;
  provider: string;
  input_tokens?: number;
  output_tokens?: number;
  input_cost?: number;
  output_cost?: number;
  is_successful: boolean;
  error_message?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Execute an operation with automatic credit management
 * - Deducts estimated credits before execution (prevents race conditions)
 * - Executes the operation
 * - Adjusts credits based on actual cost (refund excess or deduct additional)
 * - Automatically refunds on failure
 *
 * @example
 * ```ts
 * const result = await executeWithCreditGuard({
 *   organizationId: user.organization_id,
 *   estimatedCost: 100,
 *   description: "Image generation",
 *   metadata: { user_id: user.id, model: "dalle-3" },
 *   execute: async () => {
 *     return await generateImage(prompt);
 *   },
 *   calculateActualCost: async (result) => {
 *     return IMAGE_GENERATION_COST;
 *   },
 * });
 * ```
 */
export async function executeWithCreditGuard<T>({
  organizationId,
  estimatedCost,
  description,
  metadata,
  execute,
  calculateActualCost,
  onSuccess,
}: CreditGuardParams<T>): Promise<GenerationResult<T>> {
  let creditsDeducted = false;
  let deductedAmount = estimatedCost;
  const generationId = metadata.generation_id as string | undefined;

  try {
    // Step 1: Deduct estimated credits BEFORE execution
    // Uses database-level locking (SELECT FOR UPDATE) to prevent race conditions
    const deductionResult = await creditsService.deductCredits({
      organizationId,
      amount: estimatedCost,
      description: `${description} (pending)`,
      metadata,
    });

    if (!deductionResult.success) {
      return {
        success: false,
        error: "Insufficient credits",
        actualCost: estimatedCost,
      };
    }

    creditsDeducted = true;
    deductedAmount = estimatedCost;

    // Step 2: Execute the operation
    const result = await execute();

    // Step 3: Calculate actual cost (if provided)
    let actualCost = estimatedCost;
    if (calculateActualCost) {
      actualCost = await calculateActualCost(result);
    }

    // Step 4: Adjust credits based on cost difference
    const costDifference = actualCost - deductedAmount;

    if (costDifference > 0) {
      // Need to deduct more
      const additionalDeduction = await creditsService.deductCredits({
        organizationId,
        amount: costDifference,
        description: `${description} (additional)`,
        metadata: { ...metadata, generation_id: generationId },
      });

      if (!additionalDeduction.success) {
        // Refund initial deduction since we can't complete
        await creditsService.refundCredits({
          organizationId,
          amount: deductedAmount,
          description: `${description} (refund - insufficient for actual cost)`,
          metadata: { ...metadata, generation_id: generationId },
        });

        return {
          success: false,
          error: "Insufficient credits for actual cost",
          actualCost,
        };
      }
    } else if (costDifference < 0) {
      // Refund excess
      await creditsService.refundCredits({
        organizationId,
        amount: -costDifference,
        description: `${description} (refund - overestimate)`,
        metadata: { ...metadata, generation_id: generationId },
      });
    }

    // Step 5: Execute success callback if provided
    if (onSuccess) {
      await onSuccess(result);
    }

    return {
      success: true,
      result,
      actualCost,
    };
  } catch (error) {
    // CRITICAL: Refund credits on any failure
    if (creditsDeducted && deductedAmount > 0) {
      try {
        await creditsService.refundCredits({
          organizationId,
          amount: deductedAmount,
          description: `${description} (refund - failed)`,
          metadata: {
            ...metadata,
            error: error instanceof Error ? error.message : "Unknown error",
            generation_id: generationId,
          },
        });
      } catch (refundError) {
        console.error("[CreditGuard] Failed to refund credits:", refundError);
        // Log to monitoring system in production
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Operation failed",
      actualCost: deductedAmount,
    };
  }
}

/**
 * Create a usage record for tracking API usage
 * Helper function to standardize usage record creation
 */
export async function createUsageRecord(
  params: UsageRecordParams
): Promise<void> {
  await usageService.create({
    organization_id: params.organization_id,
    user_id: params.user_id,
    api_key_id: params.api_key_id || null,
    type: params.type,
    model: params.model,
    provider: params.provider,
    input_tokens: params.input_tokens || 0,
    output_tokens: params.output_tokens || 0,
    input_cost: params.input_cost || 0,
    output_cost: params.output_cost || 0,
    is_successful: params.is_successful,
    error_message: params.error_message || null,
    metadata: params.metadata,
  });
}

/**
 * Validate credit balance before attempting an operation
 * Provides a quick pre-flight check without locking
 */
export async function hasSufficientCredits(
  organizationId: string,
  requiredAmount: number
): Promise<{ sufficient: boolean; currentBalance: number }> {
  const org = await organizationsService.getById(organizationId);
  if (!org) {
    return {
      sufficient: false,
      currentBalance: 0,
    };
  }

  return {
    sufficient: org.credit_balance >= requiredAmount,
    currentBalance: org.credit_balance,
  };
}

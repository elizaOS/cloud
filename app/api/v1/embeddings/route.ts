// app/api/v1/embeddings/route.ts
import { requireAuthOrApiKey } from "@/lib/auth";
import { deductCredits, checkSufficientCredits } from "@/lib/queries/credits";
import { createUsageRecord } from "@/lib/queries/usage";
import { 
  calculateCost, 
  getProviderFromModel, 
  normalizeModelName,
  estimateTokens,
} from "@/lib/pricing";
import { getProvider } from "@/lib/providers";
import type { OpenAIEmbeddingsRequest, OpenAIEmbeddingsResponse } from "@/lib/providers/types";
import { logger } from "@/lib/utils/logger";
import type { NextRequest } from "next/server";

export const maxDuration = 60;

// Using shared OpenAI embeddings types

export async function POST(req: NextRequest) {
  try {
    const { user, apiKey } = await requireAuthOrApiKey(req);
    const request: OpenAIEmbeddingsRequest = await req.json();

    // Validate input
    if (!request.model || !request.input) {
      return Response.json(
        {
          error: {
            message: "Missing required fields: model and input",
            type: "invalid_request_error",
            param: !request.model ? "model" : "input",
            code: "missing_required_parameter",
          },
        },
        { status: 400 },
      );
    }

    // Validate input is not empty
    if (Array.isArray(request.input) && request.input.length === 0) {
      return Response.json(
        {
          error: {
            message: "input array cannot be empty",
            type: "invalid_request_error",
            param: "input",
            code: "invalid_value",
          },
        },
        { status: 400 },
      );
    }

    if (typeof request.input === 'string' && request.input.trim().length === 0) {
      return Response.json(
        {
          error: {
            message: "input string cannot be empty",
            type: "invalid_request_error",
            param: "input",
            code: "invalid_value",
          },
        },
        { status: 400 },
      );
    }

    const provider = getProviderFromModel(request.model);
    const normalizedModel = normalizeModelName(request.model);

    // Estimate cost before making API call
    const inputText = Array.isArray(request.input) 
      ? request.input.join(" ") 
      : request.input;
    const estimatedTokens = estimateTokens(inputText);
    const { totalCost: estimatedCost } = await calculateCost(
      normalizedModel,
      provider,
      estimatedTokens,
      0, // embeddings don't have output tokens
    );

    // Add 50% buffer for safety (increased from 20% to handle usage spikes)
    const requiredCredits = Math.ceil(estimatedCost * 1.5);

    // Check credits before making API call
    const creditCheck = await checkSufficientCredits(
      user.organization_id,
      requiredCredits,
    );

    if (!creditCheck.sufficient) {
      logger.warn("[OpenAI Proxy] Insufficient credits for embeddings", {
        organizationId: user.organization_id,
        required: creditCheck.required,
        balance: creditCheck.balance,
      });
      
      return Response.json(
        {
          error: {
            message: `Insufficient credits. Required: ${creditCheck.required}, Available: ${creditCheck.balance}`,
            type: "insufficient_quota",
            code: "insufficient_credits",
          },
        },
        { status: 402 },
      );
    }

    // Forward via provider
    const provider = getProvider();
    const response = await provider.embeddings(request);
    const data: OpenAIEmbeddingsResponse = await response.json();

    // Background analytics with proper pricing
    if (data.usage) {
      (async () => {
        try {
          const tokensUsed = data.usage.total_tokens;
          
          // Use proper cost calculation
          const { inputCost, totalCost } = await calculateCost(
            normalizedModel,
            provider,
            tokensUsed,
            0, // embeddings don't have output tokens
          );

          const deductResult = await deductCredits(
            user.organization_id,
            totalCost,
            `OpenAI Proxy Embeddings: ${request.model}`,
            user.id,
          );

          if (!deductResult.success) {
            logger.error("[OpenAI Proxy] Failed to deduct credits for embeddings", {
              organizationId: user.organization_id,
              cost: totalCost,
              balance: deductResult.newBalance,
            });
          }

          await createUsageRecord({
            organization_id: user.organization_id,
            user_id: user.id,
            api_key_id: apiKey?.id || null,
            type: "embeddings",
            model: normalizedModel,
            provider,
            input_tokens: data.usage.prompt_tokens,
            output_tokens: 0,
            input_cost: inputCost,
            output_cost: 0,
            is_successful: true,
          });

          logger.info("[OpenAI Proxy] Embeddings completed", {
            model: request.model,
            normalizedModel,
            provider,
            tokens: tokensUsed,
            cost: totalCost,
          });
        } catch (error) {
          logger.error("[OpenAI Proxy] Embeddings analytics error:", error);
        }
      })().catch(() => {});
    }

    return Response.json(data);
  } catch (error) {
    logger.error("[OpenAI Proxy] Embeddings error:", error);
    return Response.json(
      {
        error: {
          message:
            error instanceof Error ? error.message : "Internal server error",
          type: "api_error",
        },
      },
      { status: 500 },
    );
  }
}


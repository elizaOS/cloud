// app/api/v1/embeddings/route.ts
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { creditsService } from "@/lib/services/credits";
import { usageService } from "@/lib/services/usage";
import { organizationsService } from "@/lib/services/organizations";
import {
  calculateCost,
  getProviderFromModel,
  normalizeModelName,
  estimateTokens,
} from "@/lib/pricing";
import { getProvider } from "@/lib/providers";
import type {
  OpenAIEmbeddingsRequest,
  OpenAIEmbeddingsResponse,
} from "@/lib/providers/types";
import { logger } from "@/lib/utils/logger";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import type { NextRequest } from "next/server";

export const maxDuration = 60;

/**
 * POST /api/v1/embeddings
 * OpenAI-compatible embeddings endpoint.
 * Generates vector embeddings for text input with credit deduction.
 *
 * @param req - OpenAI-format request with model and input (string or array).
 * @returns Embeddings response with vector arrays.
 */
async function handlePOST(req: NextRequest) {
  try {
    const { user, apiKey, session_token } =
      await requireAuthOrApiKeyWithOrg(req);
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

    if (
      typeof request.input === "string" &&
      request.input.trim().length === 0
    ) {
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

    const providerName = getProviderFromModel(request.model);
    const normalizedModel = normalizeModelName(request.model);

    // Estimate cost before making API call
    const inputText = Array.isArray(request.input)
      ? request.input.join(" ")
      : request.input;
    const estimatedTokens = estimateTokens(inputText);
    const { totalCost: estimatedCost } = await calculateCost(
      normalizedModel,
      providerName,
      estimatedTokens,
      0, // embeddings don't have output tokens
    );

    // Add 50% buffer for safety (increased from 20% to handle usage spikes)
    const requiredCredits = Math.ceil(estimatedCost * 1.5);

    // Check credits before making API call
    const org = await organizationsService.getById(user.organization_id!);
    if (!org) {
      return Response.json(
        {
          error: {
            message: "Organization not found",
            type: "invalid_request_error",
            code: "organization_not_found",
          },
        },
        { status: 404 },
      );
    }

    const creditCheck = {
      sufficient: Number(org.credit_balance) >= requiredCredits,
      required: requiredCredits,
      balance: Number(org.credit_balance),
    };

    if (!creditCheck.sufficient) {
      logger.warn("[OpenAI Proxy] Insufficient credits for embeddings", {
        organizationId: user.organization_id!!,
        required: creditCheck.required,
        balance: creditCheck.balance,
      });

      return Response.json(
        {
          error: {
            message: `Insufficient balance. Required: $${Number(creditCheck.required).toFixed(2)}, Available: $${Number(creditCheck.balance).toFixed(2)}`,
            type: "insufficient_quota",
            code: "insufficient_balance",
          },
        },
        { status: 402 },
      );
    }

    // Forward via provider
    const gatewayProvider = getProvider();
    const response = await gatewayProvider.embeddings(request);
    const data: OpenAIEmbeddingsResponse = await response.json();

    // CRITICAL FIX: Deduct credits SYNCHRONOUSLY before returning response
    // to prevent free service if deduction fails
    if (data.usage) {
      const tokensUsed = data.usage.total_tokens;

      // Use proper cost calculation
      const { inputCost, totalCost } = await calculateCost(
        normalizedModel,
        providerName,
        tokensUsed,
        0, // embeddings don't have output tokens
      );

      const deductResult = await creditsService.deductCredits({
        organizationId: user.organization_id!!,
        amount: totalCost,
        description: `OpenAI Proxy Embeddings: ${request.model}`,
        metadata: { user_id: user.id },
        session_token,
        tokens_consumed: tokensUsed,
      });

      if (!deductResult.success) {
        // This should rarely happen since we checked credits before the call
        // But it can happen if credits were spent elsewhere between check and now
        logger.error(
          "[OpenAI Proxy] CRITICAL: Failed to deduct credits for embeddings after completion",
          {
            organizationId: user.organization_id!!,
            cost: String(totalCost),
            balance: deductResult.newBalance,
          },
        );

        // Return error instead of giving free service
        return Response.json(
          {
            error: {
              message: "Credit deduction failed. Please contact support.",
              type: "billing_error",
              code: "credit_deduction_failed",
            },
          },
          { status: 402 },
        );
      }

      // Background analytics (not critical for billing)
      void (async () => {
        await usageService.create({
          organization_id: user.organization_id!!,
          user_id: user.id,
          api_key_id: apiKey?.id || null,
          type: "embeddings",
          model: normalizedModel,
          provider: providerName,
          input_tokens: data.usage.prompt_tokens,
          output_tokens: 0,
          input_cost: String(inputCost),
          output_cost: String(0),
          is_successful: true,
        });

        logger.info("[OpenAI Proxy] Embeddings completed", {
          model: request.model,
          normalizedModel,
          provider: providerName,
          tokens: tokensUsed,
          cost: String(totalCost),
        });
      })();
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

export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);

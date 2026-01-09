// app/api/v1/embeddings/route.ts
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { usageService } from "@/lib/services/usage";
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
import {
  creditsService,
  InsufficientCreditsError,
} from "@/lib/services/credits";
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

    // Estimate tokens for reservation
    const inputText = Array.isArray(request.input)
      ? request.input.join(" ")
      : request.input;
    const estimatedInputTokens = estimateTokens(inputText);

    // Reserve credits BEFORE making API call to prevent TOCTOU race condition
    let reservation;
    try {
      reservation = await creditsService.reserve({
        organizationId: user.organization_id!,
        model: normalizedModel,
        provider: providerName,
        estimatedInputTokens,
        estimatedOutputTokens: 0, // embeddings don't have output tokens
        userId: user.id,
        description: `Embeddings: ${request.model}`,
      });
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        logger.warn("[Embeddings] Insufficient credits", {
          organizationId: user.organization_id!,
          required: error.required,
        });
        return Response.json(
          {
            error: {
              message: `Insufficient balance. Required: $${error.required.toFixed(4)}`,
              type: "insufficient_quota",
              code: "insufficient_balance",
            },
          },
          { status: 402 },
        );
      }
      throw error;
    }

    // Forward via provider
    const gatewayProvider = getProvider();
    const response = await gatewayProvider.embeddings(request);
    
    // Extract upstream rate limit headers to forward to client
    const upstreamRateLimitHeaders: Record<string, string> = {};
    const rateLimitHeaderNames = [
      'x-ratelimit-limit-requests',
      'x-ratelimit-limit-tokens', 
      'x-ratelimit-remaining-requests',
      'x-ratelimit-remaining-tokens',
      'x-ratelimit-reset-requests',
      'x-ratelimit-reset-tokens',
      'retry-after',
    ];
    for (const headerName of rateLimitHeaderNames) {
      const value = response.headers.get(headerName);
      if (value) {
        upstreamRateLimitHeaders[headerName] = value;
      }
    }
    
    // Log if we're approaching rate limits
    const remainingRequests = response.headers.get('x-ratelimit-remaining-requests');
    if (remainingRequests && parseInt(remainingRequests) < 50) {
      logger.warn('[OpenAI Proxy] Upstream rate limit warning', {
        remainingRequests,
        limitRequests: response.headers.get('x-ratelimit-limit-requests'),
      });
    }
    
    const data: OpenAIEmbeddingsResponse = await response.json();

    // Calculate actual cost and reconcile
    if (data.usage) {
      const tokensUsed = data.usage.total_tokens;
      const { inputCost, totalCost } = await calculateCost(
        normalizedModel,
        providerName,
        tokensUsed,
        0,
      );

      // Reconcile with actual cost (refund excess if any)
      await reservation.reconcile(totalCost);

      logger.info("[Embeddings] Credits reconciled", {
        reserved: reservation.reservedAmount,
        actual: totalCost,
        tokens: tokensUsed,
      });

      // Background analytics (not critical for billing)
      void (async () => {
        await usageService.create({
          organization_id: user.organization_id!,
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
      })();
    } else {
      // No usage data - reconcile with 0 (full refund)
      await reservation.reconcile(0);
    }

    // Return response with upstream rate limit headers forwarded
    return Response.json(data, {
      headers: upstreamRateLimitHeaders,
    });
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

// app/api/v1/embeddings/route.ts
/**
 * OpenAI-compatible embeddings endpoint.
 *
 * Uses Vercel AI SDK with AI Gateway for embedding generation.
 * Real-time usage data from SDK responses for accurate billing.
 * Includes 20% platform markup on all costs.
 *
 * IMPORTANT: Do NOT call provider APIs directly. Always use AI SDK.
 * RESILIENCE: Uses fallback provider when OIDC/Gateway is unavailable.
 */

import { embed, embedMany } from "ai";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import {
  getEmbeddingModelWithFallback,
  getGatewayHealth,
} from "@/lib/providers/ai-gateway-fallback";
import {
  withRetry,
  classifyError,
  CircuitBreakerOpenError,
} from "@/lib/utils/retry";
import { usageService } from "@/lib/services/usage";
import {
  reserveCredits,
  billUsage,
  InsufficientCreditsError,
} from "@/lib/services/ai-billing";
import { creditsService } from "@/lib/services/credits";
import {
  estimateTokens,
  getProviderFromModel,
  normalizeModelName,
} from "@/lib/pricing";
import { logger } from "@/lib/utils/logger";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import type { NextRequest } from "next/server";

export const maxDuration = 60;

interface EmbeddingsRequest {
  input: string | string[];
  model: string;
  encoding_format?: "float" | "base64";
  dimensions?: number;
  user?: string;
}

/**
 * POST /api/v1/embeddings
 * OpenAI-compatible embeddings endpoint.
 * Generates vector embeddings for text input with credit deduction.
 */
async function handlePOST(req: NextRequest) {
  try {
    const { user, apiKey } = await requireAuthOrApiKeyWithOrg(req);
    const request: EmbeddingsRequest = await req.json();

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

    const model = request.model;
    const provider = getProviderFromModel(model);
    const normalizedModel = normalizeModelName(model);

    // Estimate tokens for reservation
    const inputText = Array.isArray(request.input)
      ? request.input.join(" ")
      : request.input;
    const estimatedInputTokens = estimateTokens(inputText);

    // Reserve credits BEFORE making API call
    let reservation;
    try {
      reservation = await reserveCredits(
        {
          organizationId: user.organization_id!,
          userId: user.id,
          model,
          provider,
        },
        estimatedInputTokens,
        0, // embeddings don't have output tokens
      );
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        return Response.json(
          {
            error: {
              message: `Insufficient credits. Required: $${error.required.toFixed(4)}`,
              type: "insufficient_quota",
              code: "insufficient_balance",
            },
          },
          { status: 402 },
        );
      }
      throw error;
    }

    logger.info("[Embeddings] Request", {
      model,
      inputCount: Array.isArray(request.input) ? request.input.length : 1,
      estimatedTokens: estimatedInputTokens,
    });

    // Generate embeddings using AI SDK with fallback support
    let embeddings: number[][];
    let actualTokens = 0;

    // Get embedding model with automatic OIDC fallback
    const embeddingModel = await getEmbeddingModelWithFallback(model);

    if (Array.isArray(request.input)) {
      // Multiple inputs - use embedMany with retry
      const result = await withRetry(
        async () =>
          embedMany({
            model: embeddingModel,
            values: request.input as string[],
          }),
        "embeddings",
        { maxRetries: 2 },
      );
      embeddings = result.embeddings;
      // AI SDK embedMany returns usage per embedding
      actualTokens = result.usage?.tokens || estimatedInputTokens;
    } else {
      // Single input - use embed with retry
      const result = await withRetry(
        async () =>
          embed({
            model: embeddingModel,
            value: request.input as string,
          }),
        "embeddings",
        { maxRetries: 2 },
      );
      embeddings = [result.embedding];
      actualTokens = result.usage?.tokens || estimatedInputTokens;
    }

    // Bill using actual usage from SDK response
    const billing = await billUsage(
      {
        organizationId: user.organization_id!,
        userId: user.id,
        apiKeyId: apiKey?.id,
        model,
        provider,
      },
      { inputTokens: actualTokens, outputTokens: 0 },
      reservation,
    );

    logger.info("[Embeddings] Complete", {
      model,
      actualTokens,
      totalCost: billing.totalCost,
    });

    // Record usage (non-blocking)
    usageService
      .create({
        organization_id: user.organization_id!,
        user_id: user.id,
        api_key_id: apiKey?.id || null,
        type: "embeddings",
        model: normalizedModel,
        provider,
        input_tokens: actualTokens,
        output_tokens: 0,
        input_cost: String(billing.inputCost),
        output_cost: String(0),
        is_successful: true,
      })
      .catch((err) => {
        logger.error("[Embeddings] Failed to record usage", {
          error: err.message,
        });
      });

    // Return OpenAI-compatible response
    return Response.json({
      object: "list",
      data: embeddings.map((embedding, index) => ({
        object: "embedding",
        embedding,
        index,
      })),
      model,
      usage: {
        prompt_tokens: actualTokens,
        total_tokens: actualTokens,
      },
    });
  } catch (error) {
    const classified = classifyError(error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Log with appropriate level based on error type
    if (classified.isOIDCError) {
      logger.warn("[Embeddings] OIDC authentication error - gateway may be unavailable", {
        error: errorMessage,
        gatewayHealth: getGatewayHealth(),
      });
    } else {
      logger.error("[Embeddings] Error", {
        error: errorMessage,
        isRetryable: classified.isRetryable,
      });
    }

    // Return appropriate status code based on error type
    if (error instanceof CircuitBreakerOpenError) {
      return Response.json(
        {
          error: {
            message: "AI service temporarily unavailable. Please retry in a few moments.",
            type: "service_unavailable",
            code: "circuit_breaker_open",
            retry_after: Math.ceil(error.resetTimeMs / 1000),
          },
        },
        {
          status: 503,
          headers: {
            "Retry-After": String(Math.ceil(error.resetTimeMs / 1000)),
          },
        },
      );
    }

    if (classified.isOIDCError) {
      return Response.json(
        {
          error: {
            message: "AI Gateway authentication failed. Please retry.",
            type: "authentication_error",
            code: "oidc_unavailable",
          },
        },
        { status: 503 },
      );
    }

    if (classified.isServiceUnavailable) {
      return Response.json(
        {
          error: {
            message: "AI service temporarily unavailable.",
            type: "service_unavailable",
          },
        },
        { status: 503 },
      );
    }

    return Response.json(
      {
        error: {
          message: errorMessage || "Internal server error",
          type: "api_error",
        },
      },
      { status: 500 },
    );
  }
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);

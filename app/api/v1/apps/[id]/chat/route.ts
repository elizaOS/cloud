/**
 * App-specific chat completions endpoint.
 * Uses app credits and applies creator markup for monetization.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { getProvider } from "@/lib/providers";
import { appsService } from "@/lib/services/apps";
import { appCreditsService } from "@/lib/services/app-credits";
import {
  calculateCost,
  getProviderFromModel,
  normalizeModelName,
  estimateTokens,
} from "@/lib/pricing";
import { logger } from "@/lib/utils/logger";
import { createPreflightResponse } from "@/lib/middleware/cors-apps";
import type {
  OpenAIChatRequest,
  OpenAIChatMessage,
} from "@/lib/providers/types";

export const maxDuration = 60;

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * OPTIONS /api/v1/apps/[id]/chat
 * CORS preflight handler for app chat endpoint.
 */
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return createPreflightResponse(origin, ["POST", "OPTIONS"]);
}

/**
 * POST /api/v1/apps/[id]/chat
 * App-specific chat completions endpoint using app credits.
 *
 * This endpoint:
 * 1. Uses app-specific credit balance (not organization credits)
 * 2. Applies creator markup if monetization is enabled
 * 3. Records creator earnings from inference
 *
 * Request body follows OpenAI chat completions format.
 *
 * @returns Streaming or non-streaming chat completion response.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const origin = request.headers.get("origin");

  const withCors = (response: Response | NextResponse): Response => {
    const headers = new Headers(response.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-API-Key, X-App-Id"
    );
    headers.set("Access-Control-Max-Age", "86400");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };

  const { id: appId } = await params;

  // Get app details
  const app = await appsService.getById(appId);
  if (!app) {
    return withCors(
      NextResponse.json(
        {
          error: {
            message: "App not found",
            type: "invalid_request_error",
            code: "app_not_found",
          },
        },
        { status: 404 }
      )
    );
  }

  // Authenticate user
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  // Parse request
  const chatRequest: OpenAIChatRequest = await request.json();

  // Validate request
  if (!chatRequest.model || !chatRequest.messages) {
    return withCors(
      NextResponse.json(
        {
          error: {
            message: "Missing required fields: model and messages",
            type: "invalid_request_error",
            code: "missing_required_parameter",
          },
        },
        { status: 400 }
      )
    );
  }

  if (
    !Array.isArray(chatRequest.messages) ||
    chatRequest.messages.length === 0
  ) {
    return withCors(
      NextResponse.json(
        {
          error: {
            message: "messages must be a non-empty array",
            type: "invalid_request_error",
            code: "invalid_value",
          },
        },
        { status: 400 }
      )
    );
  }

  const model = chatRequest.model;
  const provider = getProviderFromModel(model);
  const normalizedModel = normalizeModelName(model);
  const isStreaming = chatRequest.stream ?? false;

  // Estimate cost
  const inputText = chatRequest.messages
    .map((m: OpenAIChatMessage) =>
      typeof m.content === "string" ? m.content : JSON.stringify(m.content)
    )
    .join(" ");

  const estimatedInputTokens = estimateTokens(inputText);
  const estimatedOutputTokens = 500;
  const { totalCost: estimatedBaseCost } = await calculateCost(
    normalizedModel,
    provider,
    estimatedInputTokens,
    estimatedOutputTokens
  );

  // Check and deduct app credits with markup
  const deductionResult = await appCreditsService.deductCredits({
    appId,
    userId: user.id,
    baseCost: estimatedBaseCost,
    description: `Chat: ${model}`,
    metadata: {
      model,
      provider,
      estimatedInputTokens,
      estimatedOutputTokens,
    },
  });

  if (!deductionResult.success) {
    logger.warn("[App Chat] Insufficient app credits", {
      appId,
      userId: user.id,
      required: deductionResult.totalCost,
      message: deductionResult.message,
    });

    return withCors(
      NextResponse.json(
        {
          error: {
            message:
              deductionResult.message ||
              `Insufficient app credits. Required: $${deductionResult.totalCost.toFixed(4)}`,
            type: "insufficient_quota",
            code: "insufficient_app_credits",
            required: deductionResult.totalCost,
            balance: deductionResult.newBalance,
          },
        },
        { status: 402 }
      )
    );
  }

  logger.info("[App Chat] Credits deducted", {
    appId,
    userId: user.id,
    baseCost: deductionResult.baseCost,
    creatorMarkup: deductionResult.creatorMarkup,
    totalCost: deductionResult.totalCost,
    creatorEarnings: deductionResult.creatorEarnings,
    newBalance: deductionResult.newBalance,
    monetizationEnabled: app.monetization_enabled,
  });

  // Forward to provider
  const providerInstance = getProvider();
  const providerResponse = await providerInstance.chatCompletions(chatRequest);

  if (isStreaming) {
    // For streaming, calculate actual cost on completion
    return withCors(
      new Response(providerResponse.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      })
    );
  } else {
    // Non-streaming response
    const responseData = await providerResponse.json();

    // Calculate actual cost and reconcile
    const actualInputTokens = responseData.usage?.prompt_tokens || 0;
    const actualOutputTokens = responseData.usage?.completion_tokens || 0;
    const { totalCost: actualBaseCost } = await calculateCost(
      normalizedModel,
      provider,
      actualInputTokens,
      actualOutputTokens
    );

    // If actual cost differs from estimated, we could refund or charge more
    // For now, we've already deducted estimated, so log the difference
    const costDifference = actualBaseCost - estimatedBaseCost;
    if (Math.abs(costDifference) > 0.001) {
      logger.info("[App Chat] Cost difference detected", {
        appId,
        userId: user.id,
        estimatedBaseCost,
        actualBaseCost,
        difference: costDifference,
      });
    }

    const duration = Date.now() - startTime;
    logger.info("[App Chat] Request completed", {
      appId,
      userId: user.id,
      model,
      duration,
      inputTokens: actualInputTokens,
      outputTokens: actualOutputTokens,
      actualCost: actualBaseCost,
    });

    return withCors(NextResponse.json(responseData));
  }
}

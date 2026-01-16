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
import {
  createPreflightResponse,
  addCorsHeaders,
} from "@/lib/middleware/cors-apps";
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

  // Use shared CORS helper for consistent headers
  const withCors = (response: Response | NextResponse): Response => {
    const nextRes =
      response instanceof NextResponse
        ? response
        : new NextResponse(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
    return addCorsHeaders(nextRes, origin, ["POST", "OPTIONS"]);
  };

  const { id: appId } = await params;

  // Parallelize independent operations for better performance
  const [app, authResult, chatRequest] = await Promise.all([
    appsService.getById(appId),
    requireAuthOrApiKeyWithOrg(request),
    request.json() as Promise<OpenAIChatRequest>,
  ]);

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

  const { user } = authResult;

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
    // For streaming: wrap response to capture usage and reconcile after completion
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const decoder = new TextDecoder();

    let inputTokens = 0;
    let outputTokens = 0;
    let fullContent = "";

    // Process stream in background
    (async () => {
      let lineBuffer = "";

      const reader = providerResponse.body?.getReader();
      if (!reader) {
        writer.close();
        return;
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Forward chunk to client
        writer.write(value);

        // Parse chunk to extract usage info
        lineBuffer += decoder.decode(value, { stream: true });
        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]" || !data.trim()) continue;

            const parsed = JSON.parse(data);

            // Collect content for token estimation fallback
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullContent += content;
            }

            // Extract usage from final chunk (if provider includes it)
            if (parsed.usage) {
              inputTokens = parsed.usage.prompt_tokens || 0;
              outputTokens = parsed.usage.completion_tokens || 0;
            }
          }
        }
      }

      // Flush decoder
      const finalChunk = decoder.decode();
      if (finalChunk) {
        lineBuffer += finalChunk;
      }

      if (lineBuffer.trim() && lineBuffer.startsWith("data: ")) {
        const data = lineBuffer.slice(6);
        if (data !== "[DONE]" && data.trim()) {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            fullContent += content;
          }
          if (parsed.usage) {
            inputTokens = parsed.usage.prompt_tokens || 0;
            outputTokens = parsed.usage.completion_tokens || 0;
          }
        }
      }

      writer.close();

      // Fallback: estimate tokens if usage not provided
      if (inputTokens === 0 && outputTokens === 0) {
        const inputText = chatRequest.messages
          .map((m: OpenAIChatMessage) =>
            typeof m.content === "string"
              ? m.content
              : JSON.stringify(m.content)
          )
          .join(" ");
        inputTokens = estimateTokens(inputText);
        outputTokens = estimateTokens(fullContent);

        logger.warn("[App Chat] No usage data in stream, using estimates", {
          appId,
          inputTokens,
          outputTokens,
        });
      }

      // Calculate actual cost and reconcile
      const { totalCost: actualBaseCost } = await calculateCost(
        normalizedModel,
        provider,
        inputTokens,
        outputTokens
      );

      // Reconcile the difference between estimated and actual costs
      const reconciliation = await appCreditsService.reconcileCredits({
        appId,
        userId: user.id,
        estimatedBaseCost,
        actualBaseCost,
        description: `Chat reconciliation: ${model}`,
        metadata: {
          model,
          provider,
          inputTokens,
          outputTokens,
          streaming: true,
        },
      });

      const duration = Date.now() - startTime;
      logger.info("[App Chat] Streaming request completed", {
        appId,
        userId: user.id,
        model,
        duration,
        inputTokens,
        outputTokens,
        estimatedBaseCost,
        actualBaseCost,
        reconciliation: {
          action: reconciliation.action,
          amount: reconciliation.adjustedAmount,
        },
      });
    })();

    return withCors(
      new Response(readable, {
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

    // Calculate actual cost
    const actualInputTokens = responseData.usage?.prompt_tokens || 0;
    const actualOutputTokens = responseData.usage?.completion_tokens || 0;
    const { totalCost: actualBaseCost } = await calculateCost(
      normalizedModel,
      provider,
      actualInputTokens,
      actualOutputTokens
    );

    // Reconcile the difference between estimated and actual costs
    const reconciliation = await appCreditsService.reconcileCredits({
      appId,
      userId: user.id,
      estimatedBaseCost,
      actualBaseCost,
      description: `Chat reconciliation: ${model}`,
      metadata: {
        model,
        provider,
        inputTokens: actualInputTokens,
        outputTokens: actualOutputTokens,
        streaming: false,
      },
    });

    const duration = Date.now() - startTime;
    logger.info("[App Chat] Request completed", {
      appId,
      userId: user.id,
      model,
      duration,
      inputTokens: actualInputTokens,
      outputTokens: actualOutputTokens,
      estimatedBaseCost,
      actualBaseCost,
      reconciliation: {
        action: reconciliation.action,
        amount: reconciliation.adjustedAmount,
      },
    });

    return withCors(NextResponse.json(responseData));
  }
}

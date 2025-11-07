// app/api/v1/chat/completions/route.ts
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { getProvider } from "@/lib/providers";
import {
  creditsService,
  usageService,
  generationsService,
  organizationsService,
} from "@/lib/services";
import {
  calculateCost,
  getProviderFromModel,
  normalizeModelName,
  estimateRequestCost,
  estimateTokens,
} from "@/lib/pricing";
import { logger } from "@/lib/utils/logger";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import type { NextRequest } from "next/server";
import type {
  OpenAIChatRequest,
  OpenAIChatResponse,
} from "@/lib/providers/types";

export const maxDuration = 60;

async function handlePOST(req: NextRequest) {
  const startTime = Date.now();

  try {
    // 1. Authenticate
    const { user, apiKey, session_token } =
      await requireAuthOrApiKeyWithOrg(req);

    // 2. Parse request (already in OpenAI format!)
    const request: OpenAIChatRequest = await req.json();

    // 3. Validate input
    if (!request.model || !request.messages) {
      return Response.json(
        {
          error: {
            message: "Missing required fields: model and messages",
            type: "invalid_request_error",
            param: !request.model ? "model" : "messages",
            code: "missing_required_parameter",
          },
        },
        { status: 400 },
      );
    }

    if (!Array.isArray(request.messages) || request.messages.length === 0) {
      return Response.json(
        {
          error: {
            message: "messages must be a non-empty array",
            type: "invalid_request_error",
            param: "messages",
            code: "invalid_value",
          },
        },
        { status: 400 },
      );
    }

    // Validate message content
    // Note: content can be null/empty for tool calls or function calls
    for (const msg of request.messages) {
      if (!msg.role) {
        return Response.json(
          {
            error: {
              message: "Each message must have a role",
              type: "invalid_request_error",
              param: "messages",
              code: "invalid_value",
            },
          },
          { status: 400 },
        );
      }

      // Content is optional for tool/function call messages
      const hasToolCalls = "tool_calls" in msg && msg.tool_calls;
      const hasToolCallId = "tool_call_id" in msg && msg.tool_call_id;
      const hasFunctionCall = "function_call" in msg && msg.function_call;

      if (!msg.content && !hasToolCalls && !hasToolCallId && !hasFunctionCall) {
        return Response.json(
          {
            error: {
              message:
                "Each message must have content, tool_calls, tool_call_id, or function_call",
              type: "invalid_request_error",
              param: "messages",
              code: "invalid_value",
            },
          },
          { status: 400 },
        );
      }
    }

    const model = request.model;
    const provider = getProviderFromModel(model);
    const normalizedModel = normalizeModelName(model);
    const isStreaming = request.stream ?? false;

    // 4. Check credits BEFORE making API call
    // estimateRequestCost now handles both string and multimodal content
    const estimatedCost = await estimateRequestCost(model, request.messages);

    // Check if organization has sufficient credits
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
      sufficient: Number(org.credit_balance) >= estimatedCost,
      required: estimatedCost,
      balance: Number(org.credit_balance),
    };

    if (!creditCheck.sufficient) {
      logger.warn("[OpenAI Proxy] Insufficient credits", {
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

    logger.info("[OpenAI Proxy] Chat completion request", {
      organizationId: user.organization_id!!,
      userId: user.id,
      model,
      normalizedModel,
      provider,
      streaming: isStreaming,
      messageCount: request.messages.length,
      estimatedCost,
    });

    // 5. Forward to Vercel AI Gateway
    const providerInstance = getProvider();
    const providerResponse = await providerInstance.chatCompletions(request);

    // 6. Handle streaming vs non-streaming
    if (isStreaming) {
      return handleStreamingResponse(
        providerResponse,
        user,
        apiKey ?? null,
        normalizedModel,
        provider,
        startTime,
        request.messages,
        session_token,
      );
    } else {
      return handleNonStreamingResponse(
        providerResponse,
        user,
        apiKey ?? null,
        normalizedModel,
        provider,
        startTime,
        session_token,
      );
    }
  } catch (error) {
    logger.error("[OpenAI Proxy] Error:", error);

    // Check if error is a structured gateway error
    if (
      error &&
      typeof error === "object" &&
      "error" in error &&
      "status" in error
    ) {
      const gatewayError = error as {
        status: number;
        error: { message: string; type?: string; code?: string };
      };
      return Response.json(
        { error: gatewayError.error },
        { status: gatewayError.status },
      );
    }

    // Fallback to generic error
    return Response.json(
      {
        error: {
          message:
            error instanceof Error ? error.message : "Internal server error",
          type: "api_error",
          code: "internal_server_error",
        },
      },
      { status: 500 },
    );
  }
}

// Handle non-streaming response
async function handleNonStreamingResponse(
  providerResponse: Response,
  user: { organization_id: string; id: string },
  apiKey: { id: string } | null,
  model: string,
  provider: string,
  startTime: number,
  session_token?: string,
) {
  // Parse response
  const data: OpenAIChatResponse = await providerResponse.json();

  // Extract usage
  const usage = data.usage;
  const content = data.choices[0]?.message?.content || "";

  // Deduct credits SYNCHRONOUSLY before returning response
  if (usage) {
    const { inputCost, outputCost, totalCost } = await calculateCost(
      model,
      provider,
      usage.prompt_tokens,
      usage.completion_tokens,
    );

    // CRITICAL: Deduct credits before returning response
    const deductResult = await creditsService.deductCredits({
      organizationId: user.organization_id!!,
      amount: totalCost,
      description: `OpenAI Proxy: ${model}`,
      metadata: { user_id: user.id },
      session_token,
      tokens_consumed: usage.total_tokens,
    });

    if (!deductResult.success) {
      // This should rarely happen since we checked credits before the call
      // But it can happen if credits were spent elsewhere between check and now
      logger.error("[OpenAI Proxy] Failed to deduct credits after completion", {
        organizationId: user.organization_id!!,
        cost: String(totalCost),
        balance: deductResult.newBalance,
      });

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

    // Background analytics (usage records, generation records)
    // These are not critical for billing, so can be async
    (async () => {
      try {
        const usageRecord = await usageService.create({
          organization_id: user.organization_id!!,
          user_id: user.id,
          api_key_id: apiKey?.id || null,
          type: "chat",
          model,
          provider: "vercel-gateway",
          input_tokens: usage.prompt_tokens,
          output_tokens: usage.completion_tokens,
          input_cost: String(inputCost),
          output_cost: String(outputCost),
          is_successful: true,
        });

        if (apiKey) {
          await generationsService.create({
            organization_id: user.organization_id!!,
            user_id: user.id,
            api_key_id: apiKey.id,
            type: "chat",
            model,
            provider: "vercel-gateway",
            prompt: JSON.stringify(data.choices[0]?.message),
            status: "completed",
            content,
            tokens: usage.total_tokens,
            cost: String(totalCost),
            credits: String(totalCost),
            usage_record_id: usageRecord.id,
            completed_at: new Date(),
            result: {
              text: content,
              inputTokens: usage.prompt_tokens,
              outputTokens: usage.completion_tokens,
              totalTokens: usage.total_tokens,
            },
          });
        }

        logger.info("[OpenAI Proxy] Chat completion completed", {
          durationMs: Date.now() - startTime,
          tokens: usage.total_tokens,
          cost: String(totalCost),
        });
      } catch (error) {
        logger.error("[OpenAI Proxy] Analytics error:", error);
      }
    })().catch((err) => {
      logger.error("[OpenAI Proxy] Background analytics failed:", err);
    });
  }

  // Return response after credits are deducted
  return Response.json(data);
}

// Handle streaming response
function handleStreamingResponse(
  providerResponse: Response,
  user: { organization_id: string; id: string },
  apiKey: { id: string } | null,
  model: string,
  provider: string,
  startTime: number,
  messages: Array<{ role: string; content: string | object }>,
  session_token?: string,
) {
  let totalTokens = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let fullContent = "";

  // Create transform stream to track usage
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const decoder = new TextDecoder();

  // Process stream in background
  (async () => {
    try {
      const reader = providerResponse.body?.getReader();
      if (!reader) throw new Error("No response body");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Forward chunk to client
        writer.write(value);

        // Parse chunk to extract usage info
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            if (!data.trim()) continue;

            try {
              const parsed = JSON.parse(data);

              // Collect content
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullContent += content;
              }

              // Extract usage from final chunk (if available)
              if (parsed.usage) {
                inputTokens = parsed.usage.prompt_tokens || 0;
                outputTokens = parsed.usage.completion_tokens || 0;
                totalTokens = parsed.usage.total_tokens || 0;
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      writer.close();

      // After stream completes, record analytics
      // Use fallback token estimation if usage data was not provided
      if (totalTokens === 0) {
        logger.warn(
          "[OpenAI Proxy] No usage data in stream, estimating tokens",
          {
            model,
            contentLength: fullContent.length,
          },
        );

        // Estimate tokens from content
        const messageText = messages
          .map((m) =>
            typeof m.content === "string"
              ? m.content
              : JSON.stringify(m.content),
          )
          .join(" ");
        inputTokens = estimateTokens(messageText);
        outputTokens = estimateTokens(fullContent);
        totalTokens = inputTokens + outputTokens;
      }

      if (totalTokens > 0) {
        const { inputCost, outputCost, totalCost } = await calculateCost(
          model,
          provider,
          inputTokens,
          outputTokens,
        );

        const deductResult = await creditsService.deductCredits({
          organizationId: user.organization_id!!,
          amount: totalCost,
          description: `OpenAI Proxy: ${model}`,
          metadata: { user_id: user.id },
          session_token,
          tokens_consumed: totalTokens,
        });

        if (!deductResult.success) {
          // CRITICAL: This should rarely happen since we checked credits before streaming
          // But it can happen if credits were spent elsewhere between check and stream completion
          logger.error(
            "[OpenAI Proxy] CRITICAL: Failed to deduct credits after streaming - race condition detected",
            {
              organizationId: user.organization_id!!,
              userId: user.id,
              cost: String(totalCost),
              balance: deductResult.newBalance,
            },
          );
          // Stream has already completed, so we can't return an error to the client
          // This should trigger an alert for manual review
        }

        const usageRecord = await usageService.create({
          organization_id: user.organization_id!!,
          user_id: user.id,
          api_key_id: apiKey?.id || null,
          type: "chat",
          model,
          provider: "vercel-gateway",
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          input_cost: String(inputCost),
          output_cost: String(outputCost),
          is_successful: true,
        });

        if (apiKey) {
          await generationsService.create({
            organization_id: user.organization_id!!,
            user_id: user.id,
            api_key_id: apiKey.id,
            type: "chat",
            model,
            provider: "vercel-gateway",
            prompt: JSON.stringify(messages),
            status: "completed",
            content: fullContent,
            tokens: totalTokens,
            cost: String(totalCost),
            credits: String(totalCost),
            usage_record_id: usageRecord.id,
            completed_at: new Date(),
            result: {
              text: fullContent,
              inputTokens,
              outputTokens,
              totalTokens,
            },
          });
        }

        logger.info("[OpenAI Proxy] Streaming chat completed", {
          durationMs: Date.now() - startTime,
          tokens: totalTokens,
          cost: String(totalCost),
        });
      }
    } catch (error) {
      logger.error("[OpenAI Proxy] Streaming error:", error);
      writer.abort();
    }
  })();

  // Return streaming response immediately
  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.STRICT);

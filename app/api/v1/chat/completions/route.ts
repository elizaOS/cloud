// app/api/v1/chat/completions/route.ts
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { getProvider } from "@/lib/providers";
import { creditsService } from "@/lib/services/credits";
import { usageService } from "@/lib/services/usage";
import { generationsService } from "@/lib/services/generations";
import { contentModerationService } from "@/lib/services/content-moderation";
import { appsService } from "@/lib/services/apps";
import {
  calculateCost,
  getProviderFromModel,
  normalizeModelName,
  estimateRequestCost,
  estimateTokens,
} from "@/lib/pricing";
import { logger } from "@/lib/utils/logger";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import {
  validateOrigin,
  addCorsHeaders,
  createPreflightResponse,
} from "@/lib/middleware/cors-apps";
import type { NextRequest } from "next/server";
import type {
  OpenAIChatRequest,
  OpenAIChatResponse,
  OpenAIChatMessage,
} from "@/lib/providers/types";
import { NextResponse } from "next/server";

export const maxDuration = 60;

/**
 * OPTIONS /api/v1/chat/completions
 * CORS preflight handler for chat completions endpoint.
 */
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return createPreflightResponse(origin, ["POST", "OPTIONS"]);
}

/**
 * POST /api/v1/chat/completions
 * OpenAI-compatible chat completions endpoint.
 * Processes chat messages and returns AI responses with detailed logging and credit deduction.
 *
 * @param req - OpenAI-format request with model and messages array.
 * @returns Streaming or non-streaming chat completion response.
 */
async function handlePOST(req: NextRequest) {
  const startTime = Date.now();
  const origin = req.headers.get("origin");

  // Helper to add CORS headers to any response
  const withCors = (response: Response | NextResponse): Response => {
    const headers = new Headers(response.headers);
    if (origin) {
      headers.set("Access-Control-Allow-Origin", origin);
      headers.set("Access-Control-Allow-Credentials", "true");
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };

  try {
    // Validate CORS for cross-origin requests
    const corsResult = await validateOrigin(req);
    if (!corsResult.allowed) {
      logger.warn("[Chat Completions] CORS validation failed", {
        origin,
        allowed: corsResult.allowed,
      });
      return withCors(
        NextResponse.json(
          { error: { message: "Origin not allowed", type: "cors_error" } },
          { status: 403 },
        ),
      );
    }

    // 1. Authenticate
    const { user, apiKey, session_token } =
      await requireAuthOrApiKeyWithOrg(req);

    // Extract client info for analytics
    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    // 2. Parse request (already in OpenAI format!)
    const request: OpenAIChatRequest = await req.json();

    // Log detailed message breakdown
    const systemMessages = request.messages.filter(
      (msg) => msg.role === "system",
    );
    const userMessages = request.messages.filter((msg) => msg.role === "user");
    const assistantMessages = request.messages.filter(
      (msg) => msg.role === "assistant",
    );
    const toolMessages = request.messages.filter((msg) => msg.role === "tool");

    // Helper to get content as string for logging
    const getContentString = (content: OpenAIChatMessage["content"]): string =>
      typeof content === "string" ? content : JSON.stringify(content);

    logger.info("[Chat Completions API] 📝 PROMPT BREAKDOWN", {
      model: request.model,
      totalMessages: request.messages.length,
      messageTypes: {
        system: systemMessages.length,
        user: userMessages.length,
        assistant: assistantMessages.length,
        tool: toolMessages.length,
      },
      systemPrompts: systemMessages.map((msg) => ({
        content: getContentString(msg.content),
        length: getContentString(msg.content).length,
      })),
      userPrompts: userMessages.map((msg) => ({
        content: getContentString(msg.content),
        length: getContentString(msg.content).length,
      })),
      assistantResponses: assistantMessages.map((msg) => ({
        content: getContentString(msg.content),
        length: getContentString(msg.content).length,
        toolCalls: msg.tool_calls || undefined,
      })),
      toolResponses: toolMessages.map((msg) => ({
        content: getContentString(msg.content),
        toolCallId: msg.tool_call_id,
      })),
    });

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
    for (let i = 0; i < request.messages.length; i++) {
      const msg = request.messages[i];
      if (!msg.role) {
        return Response.json(
          {
            error: {
              message: "Each message must have a role",
              type: "invalid_request_error",
              param: `messages.${i}.role`,
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
              param: `messages.${i}.content`,
              code: "invalid_value",
            },
          },
          { status: 400 },
        );
      }

      // Validate array content has non-empty text blocks (Anthropic API requirement)
      if (Array.isArray(msg.content)) {
        // Filter out empty text blocks before sending to gateway
        const filteredContent = msg.content.filter((part) => {
          if (typeof part === "object" && part !== null && "type" in part) {
            const typedPart = part as { type: string; text?: string };
            if (typedPart.type === "text") {
              const hasNonEmptyText =
                typeof typedPart.text === "string" &&
                typedPart.text.trim() !== "";
              if (!hasNonEmptyText) {
                logger.debug(
                  "[Chat Completions API] Filtering out empty text content block",
                  { messageIndex: i, role: msg.role },
                );
              }
              return hasNonEmptyText;
            }
          }
          // Keep non-text parts (images, tool results, etc.)
          return true;
        });

        // Update the message with filtered content
        if (filteredContent.length !== msg.content.length) {
          logger.info(
            "[Chat Completions API] Filtered empty text blocks from content array",
            {
              messageIndex: i,
              role: msg.role,
              originalParts: msg.content.length,
              remainingParts: filteredContent.length,
            },
          );
          msg.content = filteredContent;
        }

        // If content array is now empty and no tool calls, return error
        if (
          filteredContent.length === 0 &&
          !hasToolCalls &&
          !hasToolCallId &&
          !hasFunctionCall
        ) {
          logger.warn(
            "[Chat Completions API] Content array has no valid content",
            { messageIndex: i, role: msg.role },
          );
          return Response.json(
            {
              error: {
                message:
                  "Message content array must contain at least one non-empty text block",
                type: "invalid_request_error",
                param: `messages.${i}.content`,
                code: "invalid_value",
              },
            },
            { status: 400 },
          );
        }
      }
    }

    // Check if user is blocked due to moderation violations
    if (await contentModerationService.shouldBlockUser(user.id)) {
      logger.warn(
        "[Chat Completions API] User blocked due to moderation violations",
        {
          userId: user.id,
        },
      );
      return Response.json(
        {
          error: {
            message:
              "Your account has been suspended due to policy violations. Please contact support.",
            type: "account_suspended",
            code: "moderation_violation",
          },
        },
        { status: 403 },
      );
    }

    // Start async content moderation (runs in background, doesn't block)
    const lastUserMessage = [...request.messages]
      .reverse()
      .find((m) => m.role === "user");
    if (lastUserMessage?.content) {
      const messageText =
        typeof lastUserMessage.content === "string"
          ? lastUserMessage.content
          : lastUserMessage.content.find((c) => c.type === "text")?.text || "";

      if (messageText) {
        contentModerationService.moderateInBackground(
          messageText,
          user.id,
          undefined,
          (result) => {
            logger.warn(
              "[Chat Completions API] Async moderation detected violation",
              {
                userId: user.id,
                categories: result.flaggedCategories,
                action: result.action,
              },
            );
          },
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
    // Use org data from auth (already fetched, avoids redundant DB call)
    const creditCheck = {
      sufficient: Number(user.organization.credit_balance) >= estimatedCost,
      required: estimatedCost,
      balance: Number(user.organization.credit_balance),
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

    // 5. For streaming requests, reserve credits BEFORE making API call
    // This prevents race conditions where credits could be spent elsewhere during streaming
    let creditReservation: {
      success: boolean;
      reservationId: string | null;
      reservedAmount: number;
    } | null = null;

    if (isStreaming) {
      creditReservation = await creditsService.reserveCredits({
        organizationId: user.organization_id!!,
        amount: estimatedCost,
        description: `OpenAI Proxy (reserved): ${model}`,
        metadata: { user_id: user.id, type: "streaming_reservation" },
      });

      if (!creditReservation.success) {
        logger.warn("[OpenAI Proxy] Failed to reserve credits for streaming", {
          organizationId: user.organization_id!!,
          estimatedCost,
        });

        return Response.json(
          {
            error: {
              message: "Failed to reserve credits for streaming request",
              type: "insufficient_quota",
              code: "credit_reservation_failed",
            },
          },
          { status: 402 },
        );
      }
    }

    // 6. Forward to Vercel AI Gateway
    const providerInstance = getProvider();
    const providerResponse = await providerInstance.chatCompletions(request);

    // 7. Handle streaming vs non-streaming
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
        origin,
        ipAddress,
        userAgent,
        creditReservation!.reservedAmount,
      );
    } else {
      return withCors(
        await handleNonStreamingResponse(
          providerResponse,
          user,
          apiKey ?? null,
          normalizedModel,
          provider,
          startTime,
          session_token,
          origin,
          ipAddress,
          userAgent,
        ),
      );
    }
  } catch (error) {
    logger.error("[OpenAI Proxy] Error:", error);

    // Refund reserved credits if reservation was made before the error
    if (creditReservation?.success && creditReservation.reservedAmount > 0) {
      await creditsService.refundCredits({
        organizationId: user.organization_id!!,
        amount: creditReservation.reservedAmount,
        description: `OpenAI Proxy (refund - request failed): ${request.model}`,
        metadata: { user_id: user.id, reason: "request_failed" },
      });

      logger.info("[OpenAI Proxy] Refunded reserved credits after error", {
        organizationId: user.organization_id!!,
        refundedAmount: creditReservation.reservedAmount,
      });
    }

    // Check if error is a structured gateway error
    interface GatewayError {
      status: number;
      error: { message: string; type?: string; code?: string };
    }

    if (
      error &&
      typeof error === "object" &&
      "error" in error &&
      "status" in error
    ) {
      const status = (error as { status: unknown }).status;
      if (typeof status === "number") {
        const gatewayError = error as GatewayError;
        return withCors(
          Response.json(
            { error: gatewayError.error },
            { status: gatewayError.status },
          ),
        );
      }
    }

    // Fallback to generic error
    return withCors(
      Response.json(
        {
          error: {
            message:
              error instanceof Error ? error.message : "Internal server error",
            type: "api_error",
            code: "internal_server_error",
          },
        },
        { status: 500 },
      ),
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
  origin?: string | null,
  ipAddress?: string,
  userAgent?: string,
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

          await appsService.trackDetailedRequest(apiKey.id, {
            requestType: "chat",
            source: origin?.includes("sandbox") ? "sandbox_preview" : "api_key",
            ipAddress: ipAddress,
            userAgent: userAgent,
            userId: user.id,
            model,
            inputTokens: usage.prompt_tokens,
            outputTokens: usage.completion_tokens,
            creditsUsed: String(totalCost),
            responseTimeMs: Date.now() - startTime,
            status: "success",
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
  origin?: string | null,
  ipAddress?: string,
  userAgent?: string,
  reservedAmount?: number,
) {
  let totalTokens = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let fullContent = "";
  let creditsSettled = false;

  // Create transform stream to track usage
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const decoder = new TextDecoder();

  // Process stream in background
  (async () => {
    try {
      const reader = providerResponse.body?.getReader();
      if (!reader) throw new Error("No response body");

      // Buffer for handling partial chunks that split across network boundaries
      let lineBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Forward chunk to client
        writer.write(value);

        // Parse chunk to extract usage info (buffering for partial lines)
        lineBuffer += decoder.decode(value, { stream: true });

        // Split into lines, keeping last potentially incomplete line in buffer
        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop() ?? "";

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
              // Parse errors can still occur for malformed upstream responses
            }
          }
        }
      }

      // Flush decoder and process any remaining buffered content
      const finalChunk = decoder.decode();
      if (finalChunk) {
        lineBuffer += finalChunk;
      }

      if (lineBuffer.trim() && lineBuffer.startsWith("data: ")) {
        const data = lineBuffer.slice(6);
        if (data !== "[DONE]" && data.trim()) {
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullContent += content;
            }
            if (parsed.usage) {
              inputTokens = parsed.usage.prompt_tokens || 0;
              outputTokens = parsed.usage.completion_tokens || 0;
              totalTokens = parsed.usage.total_tokens || 0;
            }
          } catch {
            // Final buffer wasn't complete JSON - expected if stream ended cleanly
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

        // Settle the credit reservation - credits were already reserved before streaming
        // This adjusts the balance based on actual usage (refund if less, charge more if needed)
        if (reservedAmount !== undefined && reservedAmount > 0) {
          const settlementResult = await creditsService.settleReservation({
            organizationId: user.organization_id!!,
            reservedAmount,
            actualAmount: totalCost,
            description: `OpenAI Proxy: ${model}`,
            metadata: { user_id: user.id },
            session_token,
            tokens_consumed: totalTokens,
          });

          creditsSettled = true;

          if (!settlementResult.success) {
            // Additional charge was needed but failed - log for monitoring
            // The reserved amount was still charged, so no free service was given
            logger.warn(
              "[OpenAI Proxy] Settlement partial: additional charge failed (reserved amount was charged)",
              {
                organizationId: user.organization_id!!,
                userId: user.id,
                reservedAmount: String(reservedAmount),
                actualCost: String(totalCost),
                finalCost: String(settlementResult.finalCost),
              },
            );
          } else if (settlementResult.adjustmentType !== "none") {
            logger.info("[OpenAI Proxy] Credit settlement completed", {
              adjustmentType: settlementResult.adjustmentType,
              adjustment: String(settlementResult.adjustment),
              finalCost: String(settlementResult.finalCost),
            });
          }
        } else {
          // Fallback: No reservation (shouldn't happen for streaming, but handle gracefully)
          const deductResult = await creditsService.deductCredits({
            organizationId: user.organization_id!!,
            amount: totalCost,
            description: `OpenAI Proxy: ${model}`,
            metadata: { user_id: user.id },
            session_token,
            tokens_consumed: totalTokens,
          });

          creditsSettled = true;

          if (!deductResult.success) {
            logger.error(
              "[OpenAI Proxy] Failed to deduct credits after streaming (no reservation)",
              {
                organizationId: user.organization_id!!,
                userId: user.id,
                cost: String(totalCost),
                balance: deductResult.newBalance,
              },
            );
          }
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

          await appsService.trackDetailedRequest(apiKey.id, {
            requestType: "chat",
            source: origin?.includes("sandbox") ? "sandbox_preview" : "api_key",
            ipAddress: ipAddress,
            userAgent: userAgent,
            userId: user.id,
            model,
            inputTokens,
            outputTokens,
            creditsUsed: String(totalCost),
            responseTimeMs: Date.now() - startTime,
            status: "success",
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

      // Refund reserved credits only if streaming failed BEFORE settlement
      if (
        !creditsSettled &&
        reservedAmount !== undefined &&
        reservedAmount > 0
      ) {
        await creditsService.refundCredits({
          organizationId: user.organization_id,
          amount: reservedAmount,
          description: `OpenAI Proxy (refund - streaming failed): ${model}`,
          metadata: { user_id: user.id, reason: "streaming_failed" },
        });

        logger.info(
          "[OpenAI Proxy] Refunded reserved credits after streaming error",
          {
            organizationId: user.organization_id,
            refundedAmount: reservedAmount,
          },
        );
      }

      writer.abort();
    }
  })();

  // Return streaming response immediately with CORS headers
  const headers: Record<string, string> = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  };

  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }

  return new Response(readable, { headers });
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.STRICT);

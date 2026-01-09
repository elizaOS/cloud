// app/api/v1/chat/completions/route.ts
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { getProvider } from "@/lib/providers";
import {
  creditsService,
  InsufficientCreditsError,
} from "@/lib/services/credits";
import type { CreditReservation } from "@/lib/services/credits";
import { usageService } from "@/lib/services/usage";
import { generationsService } from "@/lib/services/generations";
import { contentModerationService } from "@/lib/services/content-moderation";
import { appsService } from "@/lib/services/apps";
import {
  calculateCost,
  getProviderFromModel,
  normalizeModelName,
  estimateTokens,
} from "@/lib/pricing";
import { logger } from "@/lib/utils/logger";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { createPreflightResponse } from "@/lib/middleware/cors-apps";
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

  // Helper to add CORS headers to any response - fully open, security via auth
  const withCors = (response: Response | NextResponse): Response => {
    const headers = new Headers(response.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-API-Key, X-App-Id, X-Request-ID",
    );
    headers.set("Access-Control-Max-Age", "86400");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };

  try {
    // CORS is fully open - security is via auth tokens (validated below)

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

    // 4. RESERVE credits BEFORE making API call (prevents TOCTOU race condition)
    const inputText = request.messages
      .map((m) =>
        typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      )
      .join(" ");

    let reservation: CreditReservation;
    try {
      reservation = await creditsService.reserve({
        organizationId: user.organization_id!!,
        model,
        provider,
        estimatedInputTokens: estimateTokens(inputText),
        estimatedOutputTokens: 500,
        userId: user.id,
        description: `Chat Completions: ${model}`,
      });
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        logger.warn("[Chat Completions] Insufficient credits", {
          organizationId: user.organization_id!!,
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

    logger.info("[Chat Completions] Request started", {
      organizationId: user.organization_id!!,
      userId: user.id,
      model,
      provider,
      streaming: isStreaming,
      messageCount: request.messages.length,
      reservedAmount: reservation.reservedAmount,
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
        origin,
        ipAddress,
        userAgent,
        reservation,
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
          origin,
          ipAddress,
          userAgent,
          reservation,
        ),
      );
    }
  } catch (error) {
    logger.error("[OpenAI Proxy] Error:", error);

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
  origin?: string | null,
  ipAddress?: string,
  userAgent?: string,
  reservation?: CreditReservation,
) {
  // Parse response
  const data: OpenAIChatResponse = await providerResponse.json();

  // Extract usage
  const usage = data.usage;
  const content = data.choices[0]?.message?.content || "";

  // Reconcile credits: refund difference if actual < reserved
  if (usage && reservation) {
    const { inputCost, outputCost, totalCost } = await calculateCost(
      model,
      provider,
      usage.prompt_tokens,
      usage.completion_tokens,
    );

    await reservation.reconcile(totalCost);

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
  origin?: string | null,
  ipAddress?: string,
  userAgent?: string,
  reservation?: CreditReservation,
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

        // Reconcile credits: refund difference if actual < reserved
        if (reservation) {
          await reservation.reconcile(totalCost);
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
      logger.error("[Chat Completions] Streaming error:", error);

      // Refund reserved credits if streaming failed (reconcile with 0 cost)
      if (reservation) {
        await reservation.reconcile(0);
        logger.info(
          "[Chat Completions] Refunded credits after streaming error",
          {
            organizationId: user.organization_id,
            refundedAmount: reservation.reservedAmount,
          },
        );
      }

      writer.abort();
    }
  })();

  // Return streaming response immediately with CORS headers - fully open
  const headers: Record<string, string> = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-API-Key, X-App-Id, X-Request-ID",
    "Access-Control-Max-Age": "86400",
  };

  return new Response(readable, { headers });
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.STRICT);

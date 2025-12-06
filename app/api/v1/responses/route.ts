// app/api/v1/responses/route.ts
/**
 * AI SDK v2.0+ compatibility endpoint
 *
 * The Vercel AI SDK (@ai-sdk/openai) v2.0+ sends requests to /responses instead of /chat/completions
 * This endpoint transforms the AI SDK request format to standard OpenAI format and forwards to our gateway
 *
 * AI SDK Request Format:
 *   - input: messages array
 *   - max_output_tokens: token limit
 *
 * OpenAI Format:
 *   - messages: messages array
 *   - max_tokens: token limit
 */

import { requireAuthOrApiKey } from "@/lib/auth";
import {
  getAnonymousUser,
  getOrCreateAnonymousUser,
} from "@/lib/auth-anonymous";
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
  OpenAIChatMessage,
} from "@/lib/providers/types";
import type { UserWithOrganization } from "@/lib/types";

export const maxDuration = 60;

// AI SDK request format (different from OpenAI)
interface AISdkRequest {
  model: string;
  input: Array<{
    role: "user" | "system" | "assistant" | "tool";
    content:
      | string
      | Array<{
          type: string;
          text?: string;
          image_url?: { url: string };
        }>;
    name?: string;
    tool_calls?: Array<{
      id: string;
      type: "function";
      function: {
        name: string;
        arguments: string;
      };
    }>;
    tool_call_id?: string;
    function_call?: {
      name: string;
      arguments: string;
    };
  }>;
  max_output_tokens?: number;
  temperature?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
  user?: string;
  tools?: Array<{
    type: "function";
    function: {
      name: string;
      description?: string;
      parameters?: Record<string, unknown>;
    };
  }>;
  tool_choice?:
    | "auto"
    | "none"
    | { type: "function"; function: { name: string } };
  stream?: boolean;
  // ... other AI SDK specific fields
}

/**
 * Transforms AI SDK request format to OpenAI format.
 *
 * @param aiSdkRequest - AI SDK format request.
 * @returns OpenAI format request.
 */
function transformAISdkToOpenAI(aiSdkRequest: AISdkRequest): OpenAIChatRequest {
  const {
    model,
    input, // 🔑 AI SDK uses 'input'
    max_output_tokens, // 🔑 AI SDK uses 'max_output_tokens'
    temperature,
    top_p,
    frequency_penalty,
    presence_penalty,
    stop,
    user,
    tools,
    tool_choice,
    stream,
  } = aiSdkRequest;

  // Transform messages: fix content types for multimodal
  const transformedMessages = input.map((msg) => {
    // If content is an array (multimodal), transform types
    if (Array.isArray(msg.content)) {
      return {
        ...msg,
        content: msg.content.map((part) => {
          // AI SDK uses "input_text" but OpenAI expects "text"
          if (typeof part === "object" && "type" in part) {
            if (part.type === "input_text") {
              return { ...part, type: "text" };
            }
            // Also handle "input_image" -> "image_url" if needed
            if (part.type === "input_image" && "image" in part) {
              const imagePart = part as { type: string; image: string };
              return {
                type: "image_url",
                image_url: { url: imagePart.image },
              };
            }
          }
          return part;
        }),
      };
    }
    return msg;
  });

  // Transform to OpenAI format
  const openAIRequest: OpenAIChatRequest = {
    model,
    messages: transformedMessages, // 🔑 OpenAI uses 'messages' with transformed content
    max_tokens: max_output_tokens, // 🔑 OpenAI uses 'max_tokens'
    temperature,
    top_p,
    frequency_penalty,
    presence_penalty,
    stop,
    user,
    tools,
    tool_choice,
    stream,
  };

  // Remove undefined fields
  Object.keys(openAIRequest).forEach((key) => {
    if (openAIRequest[key as keyof OpenAIChatRequest] === undefined) {
      delete openAIRequest[key as keyof OpenAIChatRequest];
    }
  });

  return openAIRequest;
}

/**
 * Transform OpenAI response format to AI SDK format
 */
function transformOpenAIToAISdk(openAIResponse: OpenAIChatResponse): object {
  return {
    id: openAIResponse.id,
    created_at: openAIResponse.created, // OpenAI: "created" -> AI SDK: "created_at"
    model: openAIResponse.model,
    object: openAIResponse.object,
    output: openAIResponse.choices.map((choice) => {
      // Flatten the message object and transform content
      const message = choice.message;
      let content;

      if (typeof message.content === "string") {
        // Simple string content
        content = [
          { type: "output_text", text: message.content, annotations: [] },
        ];
      } else if (Array.isArray(message.content)) {
        // Already array (multimodal)
        type ContentPart = string | { text?: string; [key: string]: unknown };
        content = (message.content as ContentPart[]).map((part) =>
          typeof part === "string"
            ? { type: "output_text", text: part, annotations: [] }
            : { type: "output_text", text: part.text || "", annotations: [] },
        );
      } else {
        // null or other type
        content = [
          {
            type: "output_text",
            text: String(message.content || ""),
            annotations: [],
          },
        ];
      }

      return {
        type: "message", // AI SDK requires "type": "message"
        index: choice.index,
        id: openAIResponse.id, // Use generation id
        role: message.role, // Flatten: message.role -> role
        content, // Transformed content
        finish_reason: choice.finish_reason,
        // Include tool calls if present
        ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}),
        // Include function call if present (legacy)
        ...("function_call" in message && message.function_call
          ? { function_call: message.function_call }
          : {}),
      };
    }), // OpenAI: "choices" -> AI SDK: "output" with flattened structure
    usage: openAIResponse.usage
      ? {
          input_tokens: openAIResponse.usage.prompt_tokens, // OpenAI: "prompt_tokens" -> AI SDK: "input_tokens"
          output_tokens: openAIResponse.usage.completion_tokens, // OpenAI: "completion_tokens" -> AI SDK: "output_tokens"
          total_tokens: openAIResponse.usage.total_tokens,
        }
      : undefined,
    // Preserve any provider metadata
    ...("provider_metadata" in openAIResponse && openAIResponse.provider_metadata
      ? { provider_metadata: openAIResponse.provider_metadata }
      : {}),
  };
}

/**
 * POST /api/v1/responses
 * AI SDK v2.0+ compatibility endpoint for chat completions.
 * Transforms AI SDK request format to OpenAI format and forwards to the gateway.
 * Supports both authenticated and anonymous users.
 *
 * @param req - AI SDK format request with input messages and max_output_tokens.
 * @returns Streaming or non-streaming chat completion response in AI SDK format.
 */
async function handlePOST(req: NextRequest) {
  const startTime = Date.now();

  try {
    // 1. Authenticate - Support both authenticated and anonymous users
    let user: UserWithOrganization;
    let apiKey;
    let isAnonymous = false;

    try {
      const authResult = await requireAuthOrApiKey(req);
      user = authResult.user;
      apiKey = authResult.apiKey;
    } catch (authError) {
      // Fallback to anonymous user
      logger.info("[Responses API] Privy auth failed, trying anonymous...");

      const anonData = await getAnonymousUser();
      if (anonData) {
        user = anonData.user;
        isAnonymous = true;
        logger.info("[Responses API] Anonymous user authenticated:", user.id);
      } else {
        // Create new anonymous session if none exists
        logger.info("[Responses API] Creating new anonymous session...");
        const newAnonData = await getOrCreateAnonymousUser();
        user = newAnonData.user;
        isAnonymous = true;
        logger.info("[Responses API] Created anonymous user:", user.id);
      }
    }

    // 2. Parse AI SDK request
    const aiSdkRequest: AISdkRequest = await req.json();

    // 3. Transform to OpenAI format
    const request = transformAISdkToOpenAI(aiSdkRequest);

    // Log detailed message breakdown
    const systemMessages = request.messages.filter(
      (msg) => msg.role === "system",
    );
    const userMessages = request.messages.filter(
      (msg) => msg.role === "user",
    );
    const assistantMessages = request.messages.filter(
      (msg) => msg.role === "assistant",
    );

    // Helper to get content as string for logging
    const getContentString = (content: OpenAIChatMessage["content"]): string => 
      typeof content === "string" ? content : JSON.stringify(content);

    logger.info("[Responses API] 📝 PROMPT BREAKDOWN", {
      model: request.model,
      totalMessages: request.messages.length,
      messageTypes: {
        system: systemMessages.length,
        user: userMessages.length,
        assistant: assistantMessages.length,
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
      })),
    });

    logger.debug(
      "[Responses API] Transformed AI SDK request to OpenAI format",
      {
        originalFields: Object.keys(aiSdkRequest),
        transformedFields: Object.keys(request),
        originalMessages: JSON.stringify(aiSdkRequest.input),
        transformedMessages: JSON.stringify(request.messages),
      },
    );

    // 4. Validate input
    if (!request.model || !request.messages) {
      return Response.json(
        {
          error: {
            message: "Missing required fields: model and input/messages",
            type: "invalid_request_error",
            param: !request.model ? "model" : "input",
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
            message: "input/messages must be a non-empty array",
            type: "invalid_request_error",
            param: "input",
            code: "invalid_value",
          },
        },
        { status: 400 },
      );
    }

    // Validate and clean message content
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

      // If content is null, undefined, or empty string, but we need content
      if (!msg.content && !hasToolCalls && !hasToolCallId && !hasFunctionCall) {
        logger.error("[Responses API] Invalid message content", {
          messageIndex: i,
          role: msg.role,
          hasContent: !!msg.content,
          contentType: typeof msg.content,
          contentValue: msg.content,
        });

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

      // Ensure content is a string or proper array for multimodal
      if (msg.content !== undefined && msg.content !== null) {
        if (typeof msg.content !== "string" && !Array.isArray(msg.content)) {
          logger.error("[Responses API] Invalid content type", {
            messageIndex: i,
            contentType: typeof msg.content,
            content: msg.content,
          });

          return Response.json(
            {
              error: {
                message: "Message content must be a string or array",
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

    const model = request.model;
    const provider = getProviderFromModel(model);
    const normalizedModel = normalizeModelName(model);
    const isStreaming = request.stream ?? false;

    // 5. Check credits BEFORE making API call (skip for anonymous users)
    const estimatedCost = await estimateRequestCost(model, request.messages);
    let org = null;

    // Anonymous users don't have organizations - they use message limits instead
    if (isAnonymous) {
      logger.info("[Responses API] Anonymous user - skipping credit check", {
        userId: user.id,
        estimatedCost,
      });
    } else {
      // Check if user has an organization
      if (!user.organization_id) {
        return Response.json(
          {
            error: {
              message: "User is not associated with an organization",
              type: "invalid_request_error",
              code: "no_organization",
            },
          },
          { status: 400 },
        );
      }

      // Check if organization has sufficient credits
      org = await organizationsService.getById(user.organization_id);
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
        logger.warn("[Responses API] Insufficient credits", {
          organizationId: user.organization_id,
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

      logger.info("[Responses API] Chat completion request (AI SDK format)", {
        organizationId: user.organization_id,
        userId: user.id,
        model,
        normalizedModel,
        provider,
        streaming: isStreaming,
        messageCount: request.messages.length,
        estimatedCost,
      });
    } // End of non-anonymous credit check block

    // Log for anonymous users
    if (isAnonymous) {
      logger.info("[Responses API] Anonymous chat completion request", {
        userId: user.id,
        model,
        normalizedModel,
        provider,
        streaming: isStreaming,
        messageCount: request.messages.length,
        estimatedCost,
      });
    }

    // 6. Forward to Vercel AI Gateway with Groq as preferred provider
    const providerInstance = getProvider();
    const requestWithProvider = {
      ...request,
      providerOptions: {
        gateway: {
          order: ["groq"], // Use Groq as preferred provider
        },
      },
    };
    const providerResponse =
      await providerInstance.chatCompletions(requestWithProvider);

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
      );
    } else {
      return handleNonStreamingResponse(
        providerResponse,
        user,
        apiKey ?? null,
        normalizedModel,
        provider,
        startTime,
      );
    }
  } catch (error) {
    logger.error("[Responses API] Error:", error);

    // Check if it's an authentication error
    if (
      error instanceof Error &&
      (error.message.includes("Unauthorized") ||
        error.message.includes("Invalid or expired API key") ||
        error.message.includes("API key"))
    ) {
      return Response.json(
        {
          error: {
            message: error.message,
            type: "authentication_error",
            code: "unauthorized",
          },
        },
        { status: 401 },
      );
    }

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
  user: { organization_id: string | null; id: string },
  apiKey: { id: string } | null,
  model: string,
  provider: string,
  startTime: number,
) {
  // Parse response
  const data: OpenAIChatResponse = await providerResponse.json();

  // Extract usage
  const usage = data.usage;
  const content = data.choices[0]?.message?.content || "";

  // Deduct credits SYNCHRONOUSLY before returning response (skip for anonymous users)
  if (usage && user.organization_id) {
    const { inputCost, outputCost, totalCost } = await calculateCost(
      model,
      provider,
      usage.prompt_tokens,
      usage.completion_tokens,
    );

    // CRITICAL: Deduct credits before returning response
    const deductResult = await creditsService.deductCredits({
      organizationId: user.organization_id,
      amount: totalCost,
      description: `Responses API: ${model}`,
      metadata: { user_id: user.id },
    });

    if (!deductResult.success) {
      logger.error(
        "[Responses API] Failed to deduct credits after completion",
        {
          organizationId: user.organization_id,
          cost: String(totalCost),
          balance: deductResult.newBalance,
        },
      );

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
    (async () => {
      try {
        const usageRecord = await usageService.create({
          organization_id: user.organization_id,
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
            organization_id: user.organization_id,
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

        logger.info("[Responses API] Chat completion completed", {
          durationMs: Date.now() - startTime,
          tokens: usage.total_tokens,
          cost: String(totalCost),
        });
      } catch (error) {
        logger.error("[Responses API] Analytics error:", error);
      }
    })().catch((err) => {
      logger.error("[Responses API] Background analytics failed:", err);
    });
  }

  // Transform OpenAI response to AI SDK format before returning
  const aiSdkResponse = transformOpenAIToAISdk(data);

  logger.debug("[Responses API] Transformed OpenAI response to AI SDK format", {
    openAIFields: Object.keys(data),
    aiSdkFields: Object.keys(aiSdkResponse),
  });

  return Response.json(aiSdkResponse);
}

// Type for streaming response choices
interface StreamingChoice {
  index: number;
  delta: {
    role?: string;
    content?: string;
    tool_calls?: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }>;
    function_call?: { name: string; arguments: string };
  };
  finish_reason: string | null;
}

// Handle streaming response
function handleStreamingResponse(
  providerResponse: Response,
  user: { organization_id: string | null; id: string },
  apiKey: { id: string } | null,
  model: string,
  provider: string,
  startTime: number,
  messages: Array<{ role: string; content: string | object }>,
) {
  let totalTokens = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let fullContent = "";

  // Create transform stream to track usage AND transform chunks
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  // Process stream in background
  (async () => {
    try {
      const reader = providerResponse.body?.getReader();
      if (!reader) throw new Error("No response body");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Parse chunk to transform it AND extract usage info
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");
        const transformedLines: string[] = [];

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") {
              transformedLines.push(line); // Keep [DONE] as-is
              continue;
            }
            if (!data.trim()) {
              transformedLines.push(line); // Keep empty lines
              continue;
            }

            try {
              const parsed = JSON.parse(data);

              // Collect content for analytics
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

              // Transform chunk from OpenAI format to AI SDK format
              const transformedChunk = {
                id: parsed.id,
                created_at: parsed.created, // OpenAI: "created" -> AI SDK: "created_at"
                model: parsed.model,
                object: parsed.object,
                output: parsed.choices
                  ? parsed.choices.map((choice: StreamingChoice) => {
                      // For streaming, delta contains the incremental content
                      const delta = choice.delta || {};
                      const content = delta.content
                        ? [
                            {
                              type: "output_text",
                              text: delta.content,
                              annotations: [],
                            },
                          ]
                        : undefined;

                      return {
                        type: "message", // AI SDK requires "type": "message"
                        index: choice.index,
                        id: parsed.id,
                        // For streaming deltas, role might only be in first chunk
                        ...(delta.role ? { role: delta.role } : {}),
                        // Transform content to array format
                        ...(content ? { content } : {}),
                        finish_reason: choice.finish_reason,
                        // Include tool calls if present
                        ...(delta.tool_calls
                          ? { tool_calls: delta.tool_calls }
                          : {}),
                        ...(delta.function_call
                          ? { function_call: delta.function_call }
                          : {}),
                      };
                    })
                  : undefined, // OpenAI: "choices" -> AI SDK: "output" with flattened structure
                usage: parsed.usage
                  ? {
                      input_tokens: parsed.usage.prompt_tokens,
                      output_tokens: parsed.usage.completion_tokens,
                      total_tokens: parsed.usage.total_tokens,
                    }
                  : undefined,
              };

              transformedLines.push(
                `data: ${JSON.stringify(transformedChunk)}`,
              );
            } catch {
              // If parsing fails, keep original line
              transformedLines.push(line);
            }
          } else {
            transformedLines.push(line);
          }
        }

        // Write transformed chunk
        const transformedChunk = transformedLines.join("\n");
        writer.write(encoder.encode(transformedChunk));
      }

      writer.close();

      // After stream completes, record analytics
      if (totalTokens === 0) {
        logger.warn(
          "[Responses API] No usage data in stream, estimating tokens",
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

        // Only deduct credits and record usage for authenticated users with organizations
        if (user.organization_id) {
          const deductResult = await creditsService.deductCredits({
            organizationId: user.organization_id,
            amount: totalCost,
            description: `Responses API: ${model}`,
            metadata: { user_id: user.id },
          });

          if (!deductResult.success) {
            logger.error(
              "[Responses API] CRITICAL: Failed to deduct credits after streaming",
              {
                organizationId: user.organization_id,
                userId: user.id,
                cost: String(totalCost),
                balance: deductResult.newBalance,
              },
            );
          }

          const usageRecord = await usageService.create({
            organization_id: user.organization_id,
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
              organization_id: user.organization_id,
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

          logger.info("[Responses API] Streaming chat completed", {
            durationMs: Date.now() - startTime,
            tokens: totalTokens,
            cost: String(totalCost),
          });
        } else {
          // Anonymous user - just log completion without billing
          logger.info("[Responses API] Anonymous streaming chat completed", {
            durationMs: Date.now() - startTime,
            tokens: totalTokens,
            userId: user.id,
          });
        }
      }
    } catch (error) {
      logger.error("[Responses API] Streaming error:", error);
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

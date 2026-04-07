// app/api/v1/chat/completions/route.ts
/**
 * OpenAI-compatible chat completions endpoint.
 *
 * Uses Vercel AI SDK with AI Gateway for all LLM calls.
 * Real-time usage data from SDK responses for accurate billing.
 * Includes 20% platform markup on all costs.
 *
 * IMPORTANT: Do NOT call provider APIs directly. Always use AI SDK.
 */

import { convertToModelMessages, generateText, streamText, type UIMessage } from "ai";
import type { NextRequest } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { createPreflightResponse } from "@/lib/middleware/cors-apps";
import { RateLimitPresets, withRateLimit } from "@/lib/middleware/rate-limit";
import {
  calculateCost,
  getProviderFromModel,
  getSafeModelParams,
  normalizeModelName,
} from "@/lib/pricing";
import {
  mergeAnthropicCotProviderOptions,
  resolveAnthropicThinkingBudgetTokens,
} from "@/lib/providers/anthropic-thinking";
import { getLanguageModel } from "@/lib/providers/language-model";
import {
  billUsage,
  estimateInputTokens,
  InsufficientCreditsError,
  recordUsageAnalytics,
  reserveCredits,
} from "@/lib/services/ai-billing";
import { appCreditsService } from "@/lib/services/app-credits";
import { appsService } from "@/lib/services/apps";
import { contentModerationService } from "@/lib/services/content-moderation";
import { type CreditReservation, creditsService } from "@/lib/services/credits";
import { createCreditReservationSettler } from "@/lib/utils/credit-reservation";
import { logger } from "@/lib/utils/logger";
import { getRouteTimeoutMs } from "@/lib/utils/request-timeout";

export const maxDuration = 800;

// Minimum tokens to reserve for actual response generation when CoT is active
const MIN_RESPONSE_TOKENS = 4096;

/**
 * Computes effective max_tokens when Anthropic CoT is enabled.
 * When thinking is active, max_tokens must be >= budgetTokens or Anthropic API rejects.
 * Additionally, we must reserve capacity for the actual response (not just thinking).
 */
function computeEffectiveMaxTokens(
  requestMaxTokens: number | undefined,
  cotBudget: number | null,
): number | undefined {
  if (cotBudget !== null) {
    // When CoT is active, ensure max_tokens covers both thinking budget AND response capacity
    // Without this, thinking consumes all tokens leaving nothing for the actual response
    return Math.max(requestMaxTokens ?? MIN_RESPONSE_TOKENS, cotBudget + MIN_RESPONSE_TOKENS);
  }
  return requestMaxTokens;
}

// ============================================================================
// Types
// ============================================================================

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content:
    | string
    | Array<{
        type: string;
        text?: string;
        image_url?: { url: string } | string;
        file?: { filename?: string; file_data?: string; file_id?: string };
      }>;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stream?: boolean;
  stop?: string | string[];
  tools?: Array<{
    type: "function";
    function: {
      name: string;
      description?: string;
      parameters?: Record<string, unknown>;
    };
  }>;
  tool_choice?: "auto" | "none" | { type: "function"; function: { name: string } };
}

// ============================================================================
// CORS
// ============================================================================

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return createPreflightResponse(origin, ["POST", "OPTIONS"]);
}

function addCorsHeaders(response: Response): Response {
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
}

// ============================================================================
// Message Conversion
// ============================================================================

/**
 * Infer image media type from URL
 */
function inferImageMediaType(url: string): string {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes(".png") || lowerUrl.includes("image/png")) return "image/png";
  if (lowerUrl.includes(".gif") || lowerUrl.includes("image/gif")) return "image/gif";
  if (lowerUrl.includes(".webp") || lowerUrl.includes("image/webp")) return "image/webp";
  if (lowerUrl.includes(".svg") || lowerUrl.includes("image/svg")) return "image/svg+xml";
  // Default to JPEG for .jpg, .jpeg, or unknown
  return "image/jpeg";
}

function getImageUrl(imageUrl: { url: string } | string): string | null {
  if (typeof imageUrl === "string") {
    return imageUrl || null;
  }
  return imageUrl.url || null;
}

function inferFileMediaType(fileData: string | undefined, filename: string | undefined): string {
  const dataUrlMatch = fileData?.match(/^data:([^;,]+)[;,]/i);
  if (dataUrlMatch?.[1]) {
    return dataUrlMatch[1];
  }

  const lowerFilename = filename?.toLowerCase() ?? "";
  if (lowerFilename.endsWith(".pdf")) return "application/pdf";
  if (lowerFilename.endsWith(".png")) return "image/png";
  if (lowerFilename.endsWith(".gif")) return "image/gif";
  if (lowerFilename.endsWith(".webp")) return "image/webp";
  if (lowerFilename.endsWith(".jpg") || lowerFilename.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  return "application/octet-stream";
}

function convertToUIMessages(messages: ChatMessage[]): UIMessage[] {
  return messages.map((msg) => {
    // Handle simple string content
    if (typeof msg.content === "string") {
      return {
        id: crypto.randomUUID(),
        role: msg.role as "system" | "user" | "assistant",
        parts: [{ type: "text" as const, text: msg.content }],
      };
    }

    // Handle multipart content (text + images)
    const parts = msg.content
      .map((part) => {
        if (part.image_url) {
          const imageUrl = getImageUrl(part.image_url);
          if (!imageUrl) {
            logger.warn("[chat/completions] Ignoring image part without url", {
              role: msg.role,
            });
            return null;
          }
          return {
            type: "file" as const,
            url: imageUrl,
            mediaType: inferImageMediaType(imageUrl),
          };
        }
        if (part.file) {
          const fileUrl = part.file.file_data;
          if (!fileUrl) {
            logger.warn("[chat/completions] Ignoring file part without file_data", {
              role: msg.role,
              filename: part.file.filename,
              hasFileId: typeof part.file.file_id === "string",
            });
            return null;
          }
          return {
            type: "file" as const,
            url: fileUrl,
            filename: part.file.filename,
            mediaType: inferFileMediaType(fileUrl, part.file.filename),
          };
        }
        if (part.text) {
          return { type: "text" as const, text: part.text };
        }
        return null;
      })
      .filter((part): part is NonNullable<typeof part> => part !== null);

    return {
      id: crypto.randomUUID(),
      role: msg.role as "system" | "user" | "assistant",
      parts,
    };
  });
}

function getMessageContent(msg: ChatMessage): string {
  if (typeof msg.content === "string") return msg.content;
  return msg.content.map((p) => p.text || "").join("");
}

// ============================================================================
// Main Handler
// ============================================================================

async function handlePOST(req: NextRequest) {
  const startTime = Date.now();
  const routeTimeoutMs = getRouteTimeoutMs(maxDuration);
  let settleReservation: ((actualCost: number) => Promise<void>) | null = null;

  try {
    // 1. Authenticate
    const { user, apiKey } = await requireAuthOrApiKeyWithOrg(req);

    // 2. Check for app monetization
    const appId = req.headers.get("X-App-Id");
    let useAppCredits = false;
    let monetizedApp: Awaited<ReturnType<typeof appsService.getById>> | null = null;

    if (appId) {
      monetizedApp = await appsService.getById(appId);
      if (monetizedApp?.monetization_enabled) {
        useAppCredits = true;
      }
    }

    // 3. Parse request
    const request: ChatRequest = await req.json();

    // 4. Validate
    if (!request.model || !request.messages?.length) {
      return addCorsHeaders(
        Response.json(
          {
            error: {
              message: "Missing required fields: model and messages",
              type: "invalid_request_error",
              code: "missing_required_parameter",
            },
          },
          { status: 400 },
        ),
      );
    }

    const model = request.model;
    const provider = getProviderFromModel(model);
    const normalizedModel = normalizeModelName(model);
    const cotBudget = resolveAnthropicThinkingBudgetTokens(model, process.env);
    const cotOptions =
      cotBudget != null ? mergeAnthropicCotProviderOptions(model, process.env, cotBudget) : {};
    const effectiveMaxTokens = computeEffectiveMaxTokens(request.max_tokens, cotBudget);

    // 5. Check content moderation
    if (await contentModerationService.shouldBlockUser(user.id)) {
      return addCorsHeaders(
        Response.json(
          {
            error: {
              message: "Your account has been suspended due to policy violations.",
              type: "account_suspended",
              code: "moderation_violation",
            },
          },
          { status: 403 },
        ),
      );
    }

    // Start async moderation in background
    const lastUserMessage = request.messages.filter((m) => m.role === "user").pop();
    if (lastUserMessage) {
      const content = getMessageContent(lastUserMessage);
      if (content) {
        contentModerationService.moderateInBackground(content, user.id, undefined, (result) => {
          logger.warn("[Chat Completions] Async moderation detected violation", {
            userId: user.id,
            categories: result.flaggedCategories,
          });
        });
      }
    }

    // 6. Estimate tokens and reserve credits
    const estimatedInputTokens = estimateInputTokens(
      request.messages.map((m) => ({ content: getMessageContent(m) })),
    );
    const estimatedOutputTokens = effectiveMaxTokens ?? request.max_tokens ?? 500;
    const affiliateCode = req.headers.get("X-Affiliate-Code");

    let reservation: CreditReservation;
    let appCreditsInfo:
      | { appId: string; estimatedBaseCost: number; app: typeof monetizedApp }
      | undefined;

    if (useAppCredits && appId && monetizedApp) {
      // App credits path
      const { totalCost } = await calculateCost(
        normalizedModel,
        provider,
        estimatedInputTokens,
        estimatedOutputTokens,
      );
      const costWithMarkup = await appCreditsService.calculateCostWithMarkup(appId, totalCost);

      const balanceCheck = await appCreditsService.checkBalance(
        appId,
        user.id,
        costWithMarkup.totalCost,
      );
      if (!balanceCheck.sufficient) {
        return addCorsHeaders(
          Response.json(
            {
              error: {
                message: `Insufficient app credits. Required: $${costWithMarkup.totalCost.toFixed(4)}`,
                type: "insufficient_quota",
                code: "insufficient_credits",
              },
            },
            { status: 402 },
          ),
        );
      }

      appCreditsInfo = {
        appId,
        estimatedBaseCost: totalCost,
        app: monetizedApp,
      };
      reservation = creditsService.createAnonymousReservation();
    } else {
      // Organization credits path
      try {
        reservation = await reserveCredits(
          {
            organizationId: user.organization_id!,
            userId: user.id,
            model,
            provider,
            affiliateCode,
          },
          estimatedInputTokens,
          estimatedOutputTokens,
        );
      } catch (error) {
        if (error instanceof InsufficientCreditsError) {
          return addCorsHeaders(
            Response.json(
              {
                error: {
                  message: `Insufficient credits. Required: $${error.required.toFixed(4)}`,
                  type: "insufficient_quota",
                  code: "insufficient_credits",
                },
              },
              { status: 402 },
            ),
          );
        }
        throw error;
      }
    }

    settleReservation = createCreditReservationSettler(reservation);

    // 7. Convert messages for AI SDK
    const systemMessage = request.messages.find((m) => m.role === "system");
    const systemPrompt = systemMessage ? getMessageContent(systemMessage) : undefined;
    const nonSystemMessages = request.messages.filter((m) => m.role !== "system");
    const uiMessages = convertToUIMessages(nonSystemMessages);

    logger.info("[Chat Completions] Request", {
      model,
      messageCount: request.messages.length,
      streaming: request.stream,
      estimatedInputTokens,
    });

    // 8. Handle streaming vs non-streaming
    if (request.stream) {
      return handleStreamingRequest(
        model,
        systemPrompt,
        uiMessages,
        request,
        user,
        apiKey ? { id: apiKey.id } : null,
        appCreditsInfo,
        affiliateCode,
        startTime,
        req.signal,
        routeTimeoutMs,
        settleReservation,
        cotOptions,
        effectiveMaxTokens,
      );
    } else {
      return handleNonStreamingRequest(
        model,
        systemPrompt,
        uiMessages,
        request,
        user,
        apiKey ? { id: apiKey.id } : null,
        appCreditsInfo,
        affiliateCode,
        startTime,
        req.signal,
        routeTimeoutMs,
        settleReservation,
        cotOptions,
        effectiveMaxTokens,
      );
    }
  } catch (error) {
    await settleReservation?.(0);
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("[Chat Completions] Error", { error: errorMessage });

    // Determine appropriate status code based on error
    let status = 500;
    let errorType = "api_error";

    if (errorMessage.includes("Unauthorized") || errorMessage.includes("Authentication")) {
      status = 401;
      errorType = "authentication_error";
    } else if (errorMessage.includes("Insufficient") || errorMessage.includes("credits")) {
      status = 402;
      errorType = "insufficient_quota";
    } else if (errorMessage.includes("Invalid") || errorMessage.includes("validation")) {
      status = 400;
      errorType = "invalid_request_error";
    }

    return addCorsHeaders(
      Response.json(
        {
          error: {
            message: errorMessage,
            type: errorType,
          },
        },
        { status },
      ),
    );
  }
}

// ============================================================================
// Streaming Handler
// ============================================================================

async function handleStreamingRequest(
  model: string,
  systemPrompt: string | undefined,
  messages: UIMessage[],
  request: ChatRequest,
  user: { id: string; organization_id: string },
  apiKey: { id: string } | null,
  appCreditsInfo: { appId: string; estimatedBaseCost: number; app: unknown } | undefined,
  affiliateCode: string | null,
  startTime: number,
  abortSignal: AbortSignal | undefined,
  timeoutMs: number,
  settleReservation: (actualCost: number) => Promise<void>,
  cotOptions: ReturnType<typeof mergeAnthropicCotProviderOptions>,
  effectiveMaxTokens: number | undefined,
) {
  const provider = getProviderFromModel(model);

  const safeParams = getSafeModelParams(model, {
    temperature: request.temperature,
    topP: request.top_p,
    frequencyPenalty: request.frequency_penalty,
    presencePenalty: request.presence_penalty,
    stopSequences: request.stop
      ? Array.isArray(request.stop)
        ? request.stop
        : [request.stop]
      : undefined,
  });

  const result = streamText({
    model: getLanguageModel(model),
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    abortSignal,
    timeout: timeoutMs,
    ...safeParams,
    ...(effectiveMaxTokens != null && { maxOutputTokens: effectiveMaxTokens }),
    ...cotOptions,
    onFinish: async ({ text, usage }) => {
      try {
        const billing = await billUsage(
          {
            organizationId: user.organization_id,
            userId: user.id,
            apiKeyId: apiKey?.id,
            model,
            provider,
            affiliateCode,
          },
          usage,
        );
        await settleReservation(billing.totalCost);

        // Handle app credits reconciliation
        if (appCreditsInfo) {
          await appCreditsService.reconcileCredits({
            appId: appCreditsInfo.appId,
            userId: user.id,
            estimatedBaseCost: appCreditsInfo.estimatedBaseCost,
            actualBaseCost: billing.totalCost,
            description: `Chat reconciliation: ${model}`,
            metadata: { model, provider, streaming: true },
          });
        }

        await recordUsageAnalytics(
          {
            organizationId: user.organization_id,
            userId: user.id,
            apiKeyId: apiKey?.id,
            model,
            provider,
          },
          billing,
          {
            type: "chat",
            content: text,
            systemPrompt,
            prompt: messages.map((m) => `[${m.role}] ${typeof m.content === "string" ? m.content : ""}`).join("\n"),
            latencyMs: Date.now() - startTime,
          },
        );

        logger.info("[Chat Completions] Streaming complete", {
          durationMs: Date.now() - startTime,
          inputTokens: billing.inputTokens,
          outputTokens: billing.outputTokens,
          totalCost: billing.totalCost,
        });
      } catch (error) {
        await settleReservation(0);
        logger.error("[Chat Completions] onFinish error", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    onAbort: async () => {
      await settleReservation(0);
      logger.info("[Chat Completions] Stream aborted before completion", { model });
    },
  });

  // Convert to OpenAI-compatible SSE stream
  const stream = result.textStream;
  const encoder = new TextEncoder();

  const openAIStream = new ReadableStream({
    async start(controller) {
      const reader = stream.getReader();
      let _fullContent = "";
      const responseId = `chatcmpl-${Date.now()}`;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          _fullContent += value;

          // Send OpenAI-format SSE chunk
          const chunk = {
            id: responseId,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [
              {
                index: 0,
                delta: { content: value },
                finish_reason: null,
              },
            ],
          };

          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        }

        // Send final chunk with finish_reason
        const finalChunk = {
          id: responseId,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: "stop",
            },
          ],
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalChunk)}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return addCorsHeaders(
    new Response(openAIStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    }),
  );
}

// ============================================================================
// Non-Streaming Handler
// ============================================================================

async function handleNonStreamingRequest(
  model: string,
  systemPrompt: string | undefined,
  messages: UIMessage[],
  request: ChatRequest,
  user: { id: string; organization_id: string },
  apiKey: { id: string } | null,
  appCreditsInfo: { appId: string; estimatedBaseCost: number; app: unknown } | undefined,
  affiliateCode: string | null,
  startTime: number,
  abortSignal: AbortSignal | undefined,
  timeoutMs: number,
  settleReservation: (actualCost: number) => Promise<void>,
  cotOptions: ReturnType<typeof mergeAnthropicCotProviderOptions>,
  effectiveMaxTokens: number | undefined,
) {
  const provider = getProviderFromModel(model);

  const safeParamsNonStream = getSafeModelParams(model, {
    temperature: request.temperature,
    topP: request.top_p,
    frequencyPenalty: request.frequency_penalty,
    presencePenalty: request.presence_penalty,
    stopSequences: request.stop
      ? Array.isArray(request.stop)
        ? request.stop
        : [request.stop]
      : undefined,
  });

  try {
    const result = await generateText({
      model: getLanguageModel(model),
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      abortSignal,
      timeout: timeoutMs,
      ...safeParamsNonStream,
      ...(effectiveMaxTokens != null && { maxOutputTokens: effectiveMaxTokens }),
      ...cotOptions,
    });

    // Bill using actual usage from SDK response
    const billing = await billUsage(
      {
        organizationId: user.organization_id,
        userId: user.id,
        apiKeyId: apiKey?.id,
        model,
        provider,
        affiliateCode,
      },
      result.usage,
    );
    await settleReservation(billing.totalCost);

    // Handle app credits
    if (appCreditsInfo) {
      await appCreditsService.reconcileCredits({
        appId: appCreditsInfo.appId,
        userId: user.id,
        estimatedBaseCost: appCreditsInfo.estimatedBaseCost,
        actualBaseCost: billing.totalCost,
        description: `Chat: ${model}`,
        metadata: { model, provider, streaming: false },
      });
    }

    await recordUsageAnalytics(
      {
        organizationId: user.organization_id,
        userId: user.id,
        apiKeyId: apiKey?.id,
        model,
        provider,
      },
      billing,
      {
        type: "chat",
        content: result.text,
        systemPrompt,
        prompt: messages.map((m) => `[${m.role}] ${typeof m.content === "string" ? m.content : ""}`).join("\n"),
        latencyMs: Date.now() - startTime,
      },
    );

    logger.info("[Chat Completions] Non-streaming complete", {
      durationMs: Date.now() - startTime,
      inputTokens: billing.inputTokens,
      outputTokens: billing.outputTokens,
      totalCost: billing.totalCost,
    });

    // Return OpenAI-compatible response
    return addCorsHeaders(
      Response.json({
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: result.text,
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: billing.inputTokens,
          completion_tokens: billing.outputTokens,
          total_tokens: billing.totalTokens,
        },
      }),
    );
  } catch (error) {
    await settleReservation(0);
    throw error;
  }
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.RELAXED);

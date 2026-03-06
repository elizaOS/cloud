/**
 * Anthropic Messages API–compatible endpoint.
 *
 * WHY: Claude Code and many integrations speak the Anthropic Messages API (POST /v1/messages,
 * x-api-key, specific request/response shapes). This route lets them point at elizaOS Cloud
 * (ANTHROPIC_BASE_URL + Cloud API key) so usage goes through Cloud credits and the same
 * auth/billing as chat completions, without a separate Anthropic key or custom proxy.
 *
 * Accepts: model, max_tokens, messages, system, stream, tools, tool_choice. Supports text,
 * images (URL + base64), and tool_use/tool_result so Claude Code and tool-using clients work.
 * Errors and streaming use Anthropic formats (e.g. event: error, rate_limit_error for credits)
 * so clients don’t need custom handling.
 */

import { streamText, generateText } from "ai";
import type { UIMessage } from "ai";
import { convertToModelMessages } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { contentModerationService } from "@/lib/services/content-moderation";
import { appsService } from "@/lib/services/apps";
import { appCreditsService } from "@/lib/services/app-credits";
import {
  reserveCredits,
  billUsage,
  recordUsageAnalytics,
  estimateInputTokens,
  InsufficientCreditsError,
} from "@/lib/services/ai-billing";
import { creditsService, type CreditReservation } from "@/lib/services/credits";
import {
  calculateCost,
  getProviderFromModel,
  normalizeModelName,
  getSafeModelParams,
} from "@/lib/pricing";
import { logger } from "@/lib/utils/logger";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { createPreflightResponse } from "@/lib/middleware/cors-apps";
import type { NextRequest } from "next/server";

export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Anthropic request/response types (mirror Anthropic API for compatibility)
// ---------------------------------------------------------------------------

type AnthropicTextBlock = { type: "text"; text: string };

type AnthropicImageBlock = {
  type: "image";
  source:
    | { type: "url"; url: string }
    | { type: "base64"; media_type: string; data: string };
};

type AnthropicToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
};

type AnthropicToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  content: string | AnthropicContentBlock[];
};

type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicImageBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock;

type AnthropicResponseBlock =
  | AnthropicTextBlock
  | AnthropicToolUseBlock;

interface AnthropicMessageParam {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

type AnthropicSystemParam =
  | string
  | Array<{ type: "text"; text: string; cache_control?: unknown }>;

interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

type AnthropicToolChoice =
  | { type: "auto" }
  | { type: "any" }
  | { type: "none" }
  | { type: "tool"; name: string };

interface AnthropicMessagesRequest {
  model: string;
  max_tokens: number;
  messages: AnthropicMessageParam[];
  system?: AnthropicSystemParam;
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  tools?: AnthropicTool[];
  tool_choice?: AnthropicToolChoice;
}

type AnthropicStopReason = "end_turn" | "max_tokens" | "stop_sequence" | "tool_use";

/** WHY: Clients send "claude-sonnet-4"; gateway expects "anthropic/claude-sonnet-4". */
function toGatewayModel(model: string): string {
  if (model.includes("/")) return model;
  if (model.startsWith("claude-")) return `anthropic/${model}`;
  return model;
}

function inferImageMediaType(urlOrType: string): string {
  const lower = urlOrType.toLowerCase();
  if (lower.includes("png") || lower === "image/png") return "image/png";
  if (lower.includes("gif") || lower === "image/gif") return "image/gif";
  if (lower.includes("webp") || lower === "image/webp") return "image/webp";
  if (lower.includes("svg") || lower === "image/svg+xml") return "image/svg+xml";
  return "image/jpeg";
}

/** WHY: Anthropic allows system as string or array of { type: "text", text }; we need a single string for the AI SDK. */
function normalizeSystemPrompt(system: AnthropicSystemParam | undefined): string | undefined {
  if (!system) return undefined;
  if (typeof system === "string") return system;
  return system.map((b) => b.text).join("\n\n");
}

/** WHY: Anthropic uses auto|none|any|{ type: "tool", name }; AI SDK uses "required" for "any". */
function mapToolChoice(
  tc: AnthropicToolChoice | undefined,
): "auto" | "none" | "required" | { type: "tool"; toolName: string } | undefined {
  if (!tc) return undefined;
  if (tc.type === "auto") return "auto";
  if (tc.type === "none") return "none";
  if (tc.type === "any") return "required";
  if (tc.type === "tool") return { type: "tool", toolName: tc.name };
  return undefined;
}

/** WHY: Anthropic uses input_schema; AI SDK uses parameters. We map so tool-using clients (e.g. Claude Code) work. */
function convertTools(tools: AnthropicTool[] | undefined): Record<string, { description?: string; parameters: Record<string, unknown> }> | undefined {
  if (!tools?.length) return undefined;
  const result: Record<string, { description?: string; parameters: Record<string, unknown> }> = {};
  for (const tool of tools) {
    result[tool.name] = {
      ...(tool.description && { description: tool.description }),
      parameters: tool.input_schema,
    };
  }
  return result;
}

function anthropicMessagesToUIMessages(messages: AnthropicMessageParam[]): UIMessage[] {
  return messages.map((msg) => {
    const content = msg.content;
    if (typeof content === "string") {
      return {
        id: crypto.randomUUID(),
        role: msg.role,
        parts: [{ type: "text" as const, text: content }],
      };
    }

    const parts = content
      .map((block): UIMessage["parts"][number] | null => {
        if (block.type === "text") {
          return { type: "text" as const, text: block.text };
        }
        if (block.type === "image" && block.source.type === "url") {
          return {
            type: "file" as const,
            url: block.source.url,
            mediaType: inferImageMediaType(block.source.url),
          };
        }
        if (block.type === "image" && block.source.type === "base64") {
          const mediaType = inferImageMediaType(block.source.media_type);
          return {
            type: "file" as const,
            url: `data:${mediaType};base64,${block.source.data}`,
            mediaType,
          };
        }
        if (block.type === "tool_use") {
          return {
            type: "tool-invocation" as const,
            toolInvocation: {
              state: "result" as const,
              toolCallId: block.id,
              toolName: block.name,
              args: block.input,
              result: {},
            },
          };
        }
        if (block.type === "tool_result") {
          return {
            type: "tool-invocation" as const,
            toolInvocation: {
              state: "result" as const,
              toolCallId: block.tool_use_id,
              toolName: "tool_result",
              args: {},
              result: typeof block.content === "string" ? block.content : JSON.stringify(block.content),
            },
          };
        }
        return null;
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    return {
      id: crypto.randomUUID(),
      role: msg.role,
      parts: parts.length ? parts : [{ type: "text" as const, text: "" }],
    };
  });
}

function getMessageContentForEstimate(msg: AnthropicMessageParam): string {
  if (typeof msg.content === "string") return msg.content;
  return msg.content
    .map((b) => {
      if (b.type === "text") return b.text;
      if (b.type === "tool_use") return JSON.stringify(b.input);
      if (b.type === "tool_result") return typeof b.content === "string" ? b.content : JSON.stringify(b.content);
      return "";
    })
    .join(" ");
}

/** WHY: Anthropic expects stop_reason; AI SDK gives finishReason. Map so clients get correct semantics. */
function mapFinishReason(reason: string, hasToolCalls: boolean): AnthropicStopReason {
  if (hasToolCalls) return "tool_use";
  if (reason === "length" || reason === "max_tokens") return "max_tokens";
  if (reason === "stop") return "end_turn";
  return "end_turn";
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return createPreflightResponse(origin, ["POST", "OPTIONS"]);
}

function addCorsHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  /* WHY: x-api-key + anthropic-version + anthropic-beta match what Claude Code and Anthropic SDKs send. */
  headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-API-Key, x-api-key, anthropic-version, anthropic-beta",
  );
  headers.set("Access-Control-Max-Age", "86400");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** WHY: Anthropic errors use { type: "error", error: { type, message } }; we match so clients parse consistently. */
function anthropicError(type: string, message: string, status: number): Response {
  return addCorsHeaders(
    Response.json({ type: "error", error: { type, message } }, { status }),
  );
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

async function handlePOST(req: NextRequest) {
  const startTime = Date.now();

  let user: { id: string; organization_id: string };
  let apiKey: { id: string } | null;
  try {
    const auth = await requireAuthOrApiKeyWithOrg(req);
    user = auth.user;
    apiKey = auth.apiKey ?? null;
  } catch (authError) {
    const msg = authError instanceof Error ? authError.message : String(authError);
    /* WHY: Always 401 for auth failures so Anthropic SDKs treat as invalid key, not quota. */
    return anthropicError("authentication_error", msg, 401);
  }

  const appId = req.headers.get("X-App-Id");
  let useAppCredits = false;
  let monetizedApp: Awaited<ReturnType<typeof appsService.getById>> | null = null;
  if (appId) {
    monetizedApp = await appsService.getById(appId);
    if (monetizedApp?.monetization_enabled) useAppCredits = true;
  }

  const body: unknown = await req.json();
  if (!body || typeof body !== "object") {
    return anthropicError("invalid_request_error", "Invalid JSON body", 400);
  }
  const request = body as AnthropicMessagesRequest;

  if (!request.model || request.max_tokens == null || !request.messages?.length) {
    return anthropicError(
      "invalid_request_error",
      "Missing required fields: model, max_tokens, messages",
      400,
    );
  }

  const model = toGatewayModel(request.model);
  const provider = getProviderFromModel(model);
  const normalizedModel = normalizeModelName(model);

  if (await contentModerationService.shouldBlockUser(user.id)) {
    return anthropicError(
      "permission_error",
      "Your account has been suspended due to policy violations.",
      403,
    );
  }

  const lastUserMessage = request.messages.filter((m) => m.role === "user").pop();
  if (lastUserMessage) {
    const content = getMessageContentForEstimate(lastUserMessage);
    if (content) {
      contentModerationService.moderateInBackground(content, user.id, undefined, (result) => {
        logger.warn("[Messages API] Async moderation detected violation", {
          userId: user.id,
          categories: result.flaggedCategories,
        });
      });
    }
  }

  const estimatedInputTokens = estimateInputTokens(
    request.messages.map((m) => ({ content: getMessageContentForEstimate(m) })),
  );
  const estimatedOutputTokens = request.max_tokens;

  let reservation: CreditReservation;
  let appCreditsInfo:
    | { appId: string; estimatedBaseCost: number; app: typeof monetizedApp }
    | undefined;

  if (useAppCredits && appId && monetizedApp) {
    const { totalCost } = await calculateCost(normalizedModel, provider, estimatedInputTokens, estimatedOutputTokens);
    const costWithMarkup = await appCreditsService.calculateCostWithMarkup(appId, totalCost);
    const balanceCheck = await appCreditsService.checkBalance(appId, user.id, costWithMarkup.totalCost);
    if (!balanceCheck.sufficient) {
        /* WHY: 429 rate_limit_error so Anthropic clients treat as quota/retry, not permanent failure. */
        return anthropicError(
          "rate_limit_error",
          `Insufficient app credits. Required: $${costWithMarkup.totalCost.toFixed(4)}`,
          429,
        );
    }
    appCreditsInfo = { appId, estimatedBaseCost: totalCost, app: monetizedApp };
    reservation = creditsService.createAnonymousReservation();
  } else {
    try {
      reservation = await reserveCredits(
        { organizationId: user.organization_id!, userId: user.id, model, provider },
        estimatedInputTokens,
        estimatedOutputTokens,
      );
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        /* WHY: Same as app credits — 429 rate_limit_error for insufficient org credits. */
        return anthropicError(
          "rate_limit_error",
          `Insufficient credits. Required: $${error.required.toFixed(4)}`,
          429,
        );
      }
      throw error;
    }
  }

  const uiMessages = anthropicMessagesToUIMessages(request.messages);
  const systemPrompt = normalizeSystemPrompt(request.system);
  const tools = convertTools(request.tools);
  const toolChoice = mapToolChoice(request.tool_choice);

  const safeParams = getSafeModelParams(model, {
    temperature: request.temperature,
    topP: request.top_p,
    stopSequences: request.stop_sequences,
  });

  try {
    if (request.stream) {
      return await handleStream(model, systemPrompt, uiMessages, request, user, apiKey, reservation, appCreditsInfo, startTime, safeParams, tools, toolChoice);
    }
    return await handleNonStream(model, systemPrompt, uiMessages, request, user, apiKey, reservation, appCreditsInfo, startTime, safeParams, tools, toolChoice);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[Messages API] Error", { error: msg });
    return anthropicError("api_error", msg, 500);
  }
}

// ---------------------------------------------------------------------------
// Non-streaming
// ---------------------------------------------------------------------------

async function handleNonStream(
  model: string,
  systemPrompt: string | undefined,
  uiMessages: UIMessage[],
  request: AnthropicMessagesRequest,
  user: { id: string; organization_id: string },
  apiKey: { id: string } | null,
  reservation: CreditReservation,
  appCreditsInfo:
    | { appId: string; estimatedBaseCost: number; app: Awaited<ReturnType<typeof appsService.getById>> }
    | undefined,
  startTime: number,
  safeParams: ReturnType<typeof getSafeModelParams>,
  tools: Record<string, { description?: string; parameters: Record<string, unknown> }> | undefined,
  toolChoice: "auto" | "none" | "required" | { type: "tool"; toolName: string } | undefined,
) {
  const provider = getProviderFromModel(model);

  const result = await generateText({
    model: gateway.languageModel(model),
    system: systemPrompt,
    messages: await convertToModelMessages(uiMessages),
    maxTokens: request.max_tokens,
    ...safeParams,
    ...(tools && { tools }),
    ...(toolChoice && { toolChoice }),
  });

  const billing = await billUsage(
    { organizationId: user.organization_id, userId: user.id, apiKeyId: apiKey?.id, model, provider },
    result.usage,
    reservation,
  );

  if (appCreditsInfo) {
    await appCreditsService.reconcileCredits({
      appId: appCreditsInfo.appId,
      userId: user.id,
      estimatedBaseCost: appCreditsInfo.estimatedBaseCost,
      actualBaseCost: billing.totalCost,
      description: `Messages API: ${model}`,
      metadata: { model, provider, streaming: false },
    });
  }

  await recordUsageAnalytics(
    { organizationId: user.organization_id, userId: user.id, apiKeyId: apiKey?.id, model, provider },
    billing,
    { type: "chat", content: result.text },
  );

  logger.info("[Messages API] Non-streaming complete", {
    durationMs: Date.now() - startTime,
    inputTokens: billing.inputTokens,
    outputTokens: billing.outputTokens,
  });

  const responseContent: AnthropicResponseBlock[] = [];
  if (result.text) {
    responseContent.push({ type: "text", text: result.text });
  }
  if (result.toolCalls?.length) {
    for (const tc of result.toolCalls) {
      responseContent.push({
        type: "tool_use",
        id: tc.toolCallId,
        name: tc.toolName,
        input: tc.args as Record<string, unknown>,
      });
    }
  }
  if (!responseContent.length) {
    responseContent.push({ type: "text", text: "" });
  }

  const hasToolCalls = result.toolCalls?.length > 0;
  const stopReason = mapFinishReason(result.finishReason, hasToolCalls);

  return addCorsHeaders(
    Response.json({
      id: `msg_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
      type: "message",
      role: "assistant",
      content: responseContent,
      model: request.model,
      stop_reason: stopReason,
      stop_sequence: null,
      usage: {
        input_tokens: billing.inputTokens,
        output_tokens: billing.outputTokens,
      },
    }),
  );
}

// ---------------------------------------------------------------------------
// Streaming
// ---------------------------------------------------------------------------

async function handleStream(
  model: string,
  systemPrompt: string | undefined,
  uiMessages: UIMessage[],
  request: AnthropicMessagesRequest,
  user: { id: string; organization_id: string },
  apiKey: { id: string } | null,
  reservation: CreditReservation,
  appCreditsInfo:
    | { appId: string; estimatedBaseCost: number; app: Awaited<ReturnType<typeof appsService.getById>> }
    | undefined,
  startTime: number,
  safeParams: ReturnType<typeof getSafeModelParams>,
  tools: Record<string, { description?: string; parameters: Record<string, unknown> }> | undefined,
  toolChoice: "auto" | "none" | "required" | { type: "tool"; toolName: string } | undefined,
) {
  const provider = getProviderFromModel(model);
  const messageId = `msg_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;

  const result = streamText({
    model: gateway.languageModel(model),
    system: systemPrompt,
    messages: await convertToModelMessages(uiMessages),
    maxTokens: request.max_tokens,
    ...safeParams,
    ...(tools && { tools }),
    ...(toolChoice && { toolChoice }),
    onFinish: async ({ text, usage }) => {
      /* WHY: Billing runs after stream ends; catch so a billing failure doesn’t leave the stream broken. */
      try {
        const billing = await billUsage(
          { organizationId: user.organization_id, userId: user.id, apiKeyId: apiKey?.id, model, provider },
          usage,
          reservation,
        );
        if (appCreditsInfo) {
          await appCreditsService.reconcileCredits({
            appId: appCreditsInfo.appId,
            userId: user.id,
            estimatedBaseCost: appCreditsInfo.estimatedBaseCost,
            actualBaseCost: billing.totalCost,
            description: `Messages API stream: ${model}`,
            metadata: { model, provider, streaming: true },
          });
        }
        await recordUsageAnalytics(
          { organizationId: user.organization_id, userId: user.id, apiKeyId: apiKey?.id, model, provider },
          billing,
          { type: "chat", content: text },
        );
        logger.info("[Messages API] Streaming complete", {
          durationMs: Date.now() - startTime,
          inputTokens: billing.inputTokens,
          outputTokens: billing.outputTokens,
        });
      } catch (error) {
        logger.error("[Messages API] onFinish billing error", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });

  const encoder = new TextEncoder();

  function sse(event: string, data: Record<string, unknown>): Uint8Array {
    return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(
          sse("message_start", {
            type: "message_start",
            message: {
              id: messageId,
              type: "message",
              role: "assistant",
              content: [],
              model: request.model,
              stop_reason: null,
              stop_sequence: null,
              usage: { input_tokens: 0, output_tokens: 0 },
            },
          }),
        );

        controller.enqueue(
          sse("content_block_start", {
            type: "content_block_start",
            index: 0,
            content_block: { type: "text", text: "" },
          }),
        );

        /* WHY: Anthropic sends ping for keepalive; some clients/proxies rely on it to avoid timeouts. */
        controller.enqueue(sse("ping", { type: "ping" }));

        const reader = result.textStream.getReader();
        let outputChars = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          outputChars += value.length;
          controller.enqueue(
            sse("content_block_delta", {
              type: "content_block_delta",
              index: 0,
              delta: { type: "text_delta", text: value },
            }),
          );
        }

        controller.enqueue(
          sse("content_block_stop", { type: "content_block_stop", index: 0 }),
        );

        const approxOutputTokens = Math.max(1, Math.ceil(outputChars / 4));
        controller.enqueue(
          sse("message_delta", {
            type: "message_delta",
            delta: { stop_reason: "end_turn", stop_sequence: null },
            usage: { output_tokens: approxOutputTokens },
          }),
        );

        controller.enqueue(
          sse("message_stop", { type: "message_stop" }),
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error("[Messages API] Stream error", { error: msg });
        /* WHY: Anthropic stream errors use event: error; emit so clients show error instead of broken stream. */
        controller.enqueue(
          sse("error", {
            type: "error",
            error: { type: "api_error", message: msg },
          }),
        );
      } finally {
        controller.close();
      }
    },
  });

  return addCorsHeaders(
    new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    }),
  );
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.RELAXED);

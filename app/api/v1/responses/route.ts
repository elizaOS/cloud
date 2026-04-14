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

import type { NextRequest } from "next/server";
import { getErrorStatusCode, getSafeErrorMessage } from "@/lib/api/errors";
import { requireAuthOrApiKey } from "@/lib/auth";
import {
  getAnonymousUser,
  getOrCreateAnonymousUser,
} from "@/lib/auth-anonymous";
import {
  RateLimitPresets,
  enforceOrgRateLimit,
  withRateLimit,
} from "@/lib/middleware/rate-limit";
import { isGroqNativeModel } from "@/lib/models";
import {
  calculateCost,
  estimateRequestCost,
  estimateTokens,
  getProviderFromModel,
  isReasoningModel,
  normalizeModelName,
} from "@/lib/pricing";
import {
  getProviderForModelWithFallback,
  withProviderFallback,
} from "@/lib/providers";
import { mergeGatewayGroqPreferenceWithAnthropicCot } from "@/lib/providers/anthropic-thinking";
import {
  getAiProviderConfigurationError,
  hasGatewayProviderConfigured,
  hasGroqLanguageModelProviderConfigured,
} from "@/lib/providers/language-model";
import type {
  ChatCompletionsTool,
  ChatCompletionsToolChoice,
  OpenAIChatRequest,
  OpenAIChatResponse,
} from "@/lib/providers/types";
import { contentModerationService } from "@/lib/services/content-moderation";
import { creditsService } from "@/lib/services/credits";
import { generationsService } from "@/lib/services/generations";
import { llmTrajectoryService } from "@/lib/services/llm-trajectory";
import { usageService } from "@/lib/services/usage";
import type { UserWithOrganization } from "@/lib/types";
import { logger } from "@/lib/utils/logger";
import { getRouteTimeoutMs } from "@/lib/utils/request-timeout";
import {
  type ResponsesUsage,
  wrapWithUsageExtraction,
} from "@/lib/utils/responses-stream-reconcile";

export const maxDuration = 800;

interface ResponsesTrajectoryContext {
  purpose?: string;
  modelType?: string;
  requestId?: string;
  systemPrompt?: string;
  userPrompt?: string;
  metadata: Record<string, unknown>;
}

function hasResponsesRouteProviderConfigured(model: string): boolean {
  return isGroqNativeModel(model)
    ? hasGroqLanguageModelProviderConfigured()
    : hasGatewayProviderConfigured();
}

function getResponsesRouteProviderConfigurationError(model: string): string {
  if (isGroqNativeModel(model)) {
    return "Groq models are not configured on this deployment";
  }

  return getAiProviderConfigurationError();
}

// ---------------------------------------------------------------------------
// Tool format types
// ---------------------------------------------------------------------------
//
// OpenAI exposes two distinct tool formats depending on which API surface
// the client is talking to:
//
//   1. Chat Completions API tools (NESTED):
//        { type: "function", function: { name, description?, parameters? } }
//
//   2. Responses API tools (FLAT):
//        { type: "function", name, description?, parameters? }
//
// gpt-5.x models and clients built around the Responses API (Codex CLI,
// the AI SDK Responses transport, etc.) send the flat shape. Older clients
// and the Chat Completions API itself use the nested shape. Our `/v1/responses`
// endpoint accepts requests from either kind of client and forwards
// downstream to a Chat Completions call, so it has to accept both shapes
// on input and emit the nested shape on output.
//
// We model this as a discriminated union so the normalization logic can
// branch on the presence of `function` vs `name` without unsafe casts.

interface ResponsesFlatTool {
  type: "function";
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

type AISdkInputTool = ResponsesFlatTool | ChatCompletionsTool;

// Flat Responses-API tool_choice variant. The nested Chat Completions
// shape `{type: "function", function: {name}}` is already covered by
// ChatCompletionsToolChoice.
interface ResponsesFlatToolChoice {
  type: "function";
  name: string;
}

type AISdkInputToolChoice = ChatCompletionsToolChoice | ResponsesFlatToolChoice;

// Type guard: is this tool already in nested Chat Completions form?
function isNestedTool(tool: AISdkInputTool): tool is ChatCompletionsTool {
  return (
    "function" in tool &&
    typeof (tool as ChatCompletionsTool).function === "object" &&
    (tool as ChatCompletionsTool).function !== null
  );
}

// Type guard: is this tool in flat Responses-API form?
//
// Strictly redundant given the discriminated union (after isNestedTool
// returns false the only remaining member is ResponsesFlatTool), but kept
// as a runtime safety net: malformed requests where `name` is missing or
// non-string fall through to the unknown-shape branch and get a diagnostic
// log instead of being silently coerced.
function isFlatTool(tool: AISdkInputTool): tool is ResponsesFlatTool {
  return (
    !isNestedTool(tool) &&
    tool.type === "function" &&
    typeof (tool as ResponsesFlatTool).name === "string"
  );
}

/**
 * Normalize tool_choice from either flat (Responses API) or nested
 * (Chat Completions) form into the nested form expected downstream.
 *
 * String literals ("auto", "none", "required") and already-nested
 * objects pass through unchanged. A flat `{type: "function", name}` is
 * rewrapped to `{type: "function", function: {name}}`. Unknown shapes
 * are forwarded best-effort with a warning, mirroring the tools[] policy.
 */
function normalizeToolChoice(
  toolChoice: AISdkInputToolChoice | undefined,
): ChatCompletionsToolChoice | undefined {
  if (toolChoice === undefined) return undefined;
  if (typeof toolChoice === "string") return toolChoice;
  if (
    "function" in toolChoice &&
    typeof toolChoice.function === "object" &&
    toolChoice.function !== null
  ) {
    return toolChoice;
  }
  if (
    toolChoice.type === "function" &&
    typeof (toolChoice as ResponsesFlatToolChoice).name === "string"
  ) {
    return {
      type: "function",
      function: { name: (toolChoice as ResponsesFlatToolChoice).name },
    };
  }
  const unknownChoice = toolChoice as unknown as Record<string, unknown>;
  logger.warn(
    "[Responses API] Unrecognized tool_choice shape, passing through unchanged",
    {
      choiceType: unknownChoice?.type,
      hasFunction: Boolean(unknownChoice?.function),
      hasName: Boolean(unknownChoice?.name),
    },
  );
  return toolChoice as ChatCompletionsToolChoice;
}

// AI SDK request format (different from OpenAI)
interface AISdkRequest {
  model: string;
  input:
    | Array<{
        role: "user" | "system" | "assistant" | "tool";
        content:
          | string
          | Array<{
              type: string;
              text?: string;
              image_url?: { url: string } | string;
              image?: string;
              file_data?: string;
              file_url?: string;
              file_id?: string;
              filename?: string;
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
      }>
    | string
    | undefined;
  max_output_tokens?: number;
  temperature?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
  user?: string;
  tools?: Array<AISdkInputTool>;
  tool_choice?: AISdkInputToolChoice;
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

  const normalizedInput =
    typeof input === "string"
      ? [{ role: "user" as const, content: input }]
      : (input ?? []);

  // Transform messages: fix content types for multimodal
  const transformedMessages = normalizedInput.map((msg, msgIndex) => {
    // If content is an array (multimodal), transform types and filter empty text blocks
    if (Array.isArray(msg.content)) {
      const originalLength = msg.content.length;
      const transformedContent = msg.content
        .map((part) => {
          // AI SDK uses "input_text" but OpenAI expects "text"
          if (typeof part === "object" && "type" in part) {
            if (part.type === "input_text") {
              return { ...part, type: "text" };
            }
            // Also handle "input_image" -> "image_url" if needed
            if (
              part.type === "input_image" &&
              (("image_url" in part &&
                ((typeof part.image_url === "string" && part.image_url) ||
                  (typeof part.image_url === "object" &&
                    part.image_url !== null &&
                    typeof part.image_url.url === "string" &&
                    part.image_url.url))) ||
                ("image" in part && typeof part.image === "string"))
            ) {
              return {
                type: "image_url",
                image_url: {
                  url:
                    (typeof part.image_url === "string"
                      ? part.image_url
                      : typeof part.image_url === "object" &&
                          part.image_url !== null &&
                          typeof part.image_url.url === "string"
                        ? part.image_url.url
                        : undefined) ??
                    (typeof part.image === "string" ? part.image : ""),
                },
              };
            }
            if (part.type === "input_file") {
              if (typeof part.file_data === "string") {
                return {
                  type: "file",
                  file: {
                    ...(part.filename ? { filename: part.filename } : {}),
                    file_data: part.file_data,
                  },
                };
              }
              if (typeof part.file_url === "string") {
                return {
                  type: "file",
                  file: {
                    ...(part.filename ? { filename: part.filename } : {}),
                    file_data: part.file_url,
                  },
                };
              }
              if (typeof part.file_id === "string") {
                return {
                  type: "file",
                  file: {
                    ...(part.filename ? { filename: part.filename } : {}),
                    file_id: part.file_id,
                  },
                };
              }
            }
          }
          return part;
        })
        // Filter out empty text content blocks (Anthropic API requires non-empty text)
        .filter((part) => {
          if (typeof part === "object" && part !== null && "type" in part) {
            const typedPart = part as { type: string; text?: string };
            // Keep text blocks only if they have non-empty text
            if (typedPart.type === "text" || typedPart.type === "input_text") {
              const hasNonEmptyText =
                typeof typedPart.text === "string" &&
                typedPart.text.trim() !== "";
              if (!hasNonEmptyText) {
                logger.debug(
                  "[Responses API] Filtering out empty text content block",
                  {
                    messageIndex: msgIndex,
                    role: msg.role,
                    textValue: typedPart.text,
                  },
                );
              }
              return hasNonEmptyText;
            }
          }
          // Keep non-text parts (images, etc.)
          return true;
        });

      // Log if we filtered out content
      if (transformedContent.length < originalLength) {
        logger.info(
          "[Responses API] Filtered empty text blocks from content array",
          {
            messageIndex: msgIndex,
            role: msg.role,
            originalParts: originalLength,
            remainingParts: transformedContent.length,
          },
        );
      }

      // If content array is now empty or has only empty parts, convert to empty string
      // This will be caught by validation later
      if (transformedContent.length === 0) {
        logger.warn(
          "[Responses API] Content array became empty after filtering",
          {
            messageIndex: msgIndex,
            role: msg.role,
          },
        );
        return { ...msg, content: "" };
      }

      return { ...msg, content: transformedContent };
    }
    return msg;
  });

  // Normalize tools to OpenAI Chat Completions format. Clients built around
  // the Responses API (Codex, gpt-5.x) send tools in the flat shape
  // `{type, name, parameters}`; the downstream call expects the nested
  // shape `{type, function: {name, parameters}}` and would otherwise
  // reject the request with "tools.0.function: undefined".
  // Already-nested tools pass through unchanged.
  const normalizedTools: ChatCompletionsTool[] | undefined = tools?.map(
    (tool): ChatCompletionsTool => {
      if (isNestedTool(tool)) {
        return tool;
      }
      if (isFlatTool(tool)) {
        return {
          type: "function",
          function: {
            name: tool.name,
            ...(tool.description !== undefined
              ? { description: tool.description }
              : {}),
            ...(tool.parameters !== undefined
              ? { parameters: tool.parameters }
              : {}),
          },
        };
      }
      // Unknown shape — log a warning so future tool variants surface
      // a clear diagnostic instead of an opaque downstream validation error.
      // The `tool` value here is `never` per the discriminated union, but we
      // narrow back to a record for diagnostic field extraction.
      const unknownTool = tool as unknown as Record<string, unknown>;
      logger.warn(
        "[Responses API] Unrecognized tool shape, passing through unchanged",
        {
          toolType: unknownTool?.type,
          hasFunction: Boolean(unknownTool?.function),
          hasName: Boolean(unknownTool?.name),
        },
      );
      // Intentional best-effort: forward the malformed tool unchanged so
      // the downstream provider surfaces the original validation error
      // rather than silently dropping the tool. The cast is a lie that
      // satisfies the return type — the warning above is the real signal.
      return tool as ChatCompletionsTool;
    },
  );

  const normalizedToolChoice = normalizeToolChoice(tool_choice);

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
    tools: normalizedTools,
    tool_choice: normalizedToolChoice,
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
 *
 * AI SDK v5+ expects a specific response schema with required fields.
 * This function transforms OpenAI chat completion responses to match.
 */
function transformOpenAIToAISdk(openAIResponse: OpenAIChatResponse): object {
  // Get the first choice's finish reason to determine status
  const firstChoice = openAIResponse.choices[0];
  const finishReason = firstChoice?.finish_reason || "stop";

  // Map OpenAI finish_reason to AI SDK status
  // "length" = max tokens reached, "content_filter" = blocked, "stop" = normal completion
  let status: "completed" | "incomplete" | "failed";
  let incompleteReason: string | null = null;

  switch (finishReason) {
    case "length":
      status = "incomplete";
      incompleteReason = "max_output_tokens";
      break;
    case "content_filter":
      status = "failed";
      break;
    case "stop":
    default:
      status = "completed";
      break;
  }

  return {
    id: openAIResponse.id,
    object: "response", // AI SDK expects "response" not "chat.completion"
    created_at: openAIResponse.created,
    model: openAIResponse.model,
    status, // AI SDK requires status field
    // Required: incomplete_details must be object or null
    incomplete_details: incompleteReason ? { reason: incompleteReason } : null,
    output: openAIResponse.choices.map((choice) => {
      // Flatten the message object and transform content
      const message = choice.message;
      const messageContent = message.content;
      let content;

      if (typeof messageContent === "string") {
        // Simple string content
        content = [
          { type: "output_text", text: messageContent, annotations: [] },
        ];
      } else if (Array.isArray(messageContent)) {
        // Already array (multimodal)
        content = (messageContent as Array<unknown>).map((part: unknown) => {
          if (typeof part === "string") {
            return { type: "output_text", text: part, annotations: [] };
          }
          if (
            typeof part === "object" &&
            part !== null &&
            "text" in part &&
            typeof (part as { text: unknown }).text === "string"
          ) {
            return {
              type: "output_text",
              text: (part as { text: string }).text,
              annotations: [],
            };
          }
          return { type: "output_text", text: "", annotations: [] };
        });
      } else {
        // null or other type
        content = [
          {
            type: "output_text",
            text: String(messageContent || ""),
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
        status: choice.finish_reason === "length" ? "incomplete" : "completed",
        // Include tool calls if present
        ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}),
        // Include function call if present
        ...("function_call" in message && message.function_call
          ? { function_call: message.function_call }
          : {}),
      };
    }), // OpenAI: "choices" -> AI SDK: "output" with flattened structure
    usage: openAIResponse.usage
      ? {
          input_tokens: openAIResponse.usage.prompt_tokens,
          output_tokens: openAIResponse.usage.completion_tokens,
          total_tokens: openAIResponse.usage.total_tokens,
        }
      : { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
    // Additional AI SDK expected fields
    error: null,
    // Preserve any provider metadata
    ...("provider_metadata" in openAIResponse &&
    openAIResponse.provider_metadata
      ? { provider_metadata: openAIResponse.provider_metadata }
      : {}),
  };
}

function stringifyMessageContent(
  content: OpenAIChatRequest["messages"][number]["content"] | undefined,
): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }

      if (part && typeof part === "object") {
        if ("text" in part && typeof part.text === "string") {
          return part.text;
        }
        if (
          "image_url" in part &&
          typeof part.image_url === "object" &&
          part.image_url !== null &&
          "url" in part.image_url &&
          typeof part.image_url.url === "string"
        ) {
          return `[image:${part.image_url.url}]`;
        }
        if ("file" in part && part.file && typeof part.file === "object") {
          const filePart = part.file as {
            filename?: string;
            file_id?: string;
            file_data?: string;
          };
          return `[file:${filePart.filename ?? filePart.file_id ?? filePart.file_data ?? "attachment"}]`;
        }
      }

      return "";
    })
    .filter((value) => value.length > 0)
    .join("\n");
}

function buildTrajectoryContext(
  req: NextRequest,
  request: OpenAIChatRequest,
): ResponsesTrajectoryContext {
  const systemPrompt = request.messages
    .filter((message) => message.role === "system")
    .map((message) => stringifyMessageContent(message.content))
    .filter((value) => value.length > 0)
    .join("\n\n");

  const transcript = request.messages
    .filter((message) => message.role !== "system")
    .map(
      (message) =>
        `${message.role}: ${stringifyMessageContent(message.content)}`,
    )
    .filter((value) => value.length > 0)
    .join("\n\n");

  return {
    purpose: req.headers.get("x-eliza-llm-purpose") ?? undefined,
    modelType: req.headers.get("x-eliza-model-type") ?? undefined,
    requestId: req.headers.get("x-request-id") ?? undefined,
    systemPrompt: systemPrompt || undefined,
    userPrompt: transcript || undefined,
    metadata: {
      route: "responses",
      transport: "chat-completions-transform",
      messageCount: request.messages.length,
      stream: request.stream ?? false,
      hasTools: Array.isArray(request.tools) && request.tools.length > 0,
    },
  };
}

async function logResponsesTrajectory(params: {
  user: { organization_id: string | null; id: string };
  apiKey: { id: string } | null;
  model: string;
  provider: string;
  startTime: number;
  inputTokens: number;
  outputTokens: number;
  inputCost: number;
  outputCost: number;
  responseText: string;
  context: ResponsesTrajectoryContext;
}): Promise<void> {
  if (!params.user.organization_id) {
    return;
  }

  await llmTrajectoryService.logCall({
    organizationId: params.user.organization_id,
    userId: params.user.id,
    apiKeyId: params.apiKey?.id ?? null,
    model: params.model,
    provider: params.provider,
    purpose: params.context.purpose,
    requestId: params.context.requestId,
    systemPrompt: params.context.systemPrompt,
    userPrompt: params.context.userPrompt,
    responseText: params.responseText,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    inputCost: params.inputCost,
    outputCost: params.outputCost,
    latencyMs: Date.now() - params.startTime,
    isSuccessful: true,
    metadata: {
      ...params.context.metadata,
      modelType: params.context.modelType,
    },
  });
}

// ---------------------------------------------------------------------------
// Native Responses-API passthrough
// ---------------------------------------------------------------------------

/**
 * Pull a safe error envelope out of an unknown gateway error payload.
 *
 * Upstream gateway errors come back as unknown JSON. We want to forward
 * the user-facing message + type + code, but we must NOT forward
 * arbitrary nested objects, stack traces, or infrastructure details a
 * misconfigured gateway might include. This pulls only the well-known
 * OpenAI-compatible fields and stringifies values to keep the shape
 * predictable for clients.
 */
function sanitizeGatewayError(raw: unknown): {
  message: string;
  type: string;
  code: string;
  param?: string;
} {
  const fallback = {
    message: "Upstream gateway error",
    type: "api_error",
    code: "upstream_error",
  };
  if (!raw || typeof raw !== "object") return fallback;
  const obj = raw as Record<string, unknown>;
  // The gateway often nests an `error` object inside `error` — peel it
  // once if we see that shape.
  const inner =
    obj.error && typeof obj.error === "object"
      ? (obj.error as Record<string, unknown>)
      : obj;
  const sanitized: ReturnType<typeof sanitizeGatewayError> = {
    message:
      typeof inner.message === "string" && inner.message.length > 0
        ? inner.message.slice(0, 1000)
        : fallback.message,
    type:
      typeof inner.type === "string" && inner.type.length > 0
        ? inner.type.slice(0, 100)
        : fallback.type,
    code:
      typeof inner.code === "string" && inner.code.length > 0
        ? inner.code.slice(0, 100)
        : fallback.code,
  };
  if (typeof inner.param === "string" && inner.param.length > 0) {
    sanitized.param = inner.param.slice(0, 200);
  }
  return sanitized;
}

const PASSTHROUGH_STRIP_HEADERS = [
  // Hop-by-hop
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
  "keep-alive",
  // Session-bearing headers
  "set-cookie",
  // Gateway/infra internals
  "cf-ray",
  "cf-cache-status",
  "server",
  "via",
  "x-vercel-cache",
  "x-vercel-id",
  "x-vercel-execution-region",
] as const;

function buildPassthroughResponseHeaders(headers: HeadersInit): Headers {
  const outHeaders = new Headers(headers);
  for (const header of PASSTHROUGH_STRIP_HEADERS) {
    outHeaders.delete(header);
  }
  outHeaders.set("x-eliza-responses-passthrough", "1");
  return outHeaders;
}

/**
 * Detect whether a request body is a native OpenAI Responses-API payload
 * that must be forwarded to the upstream `/responses` endpoint unchanged.
 *
 * We treat a payload as native Responses if ANY of the following hold:
 *   - It has a top-level `instructions` field (Codex CLI / OpenAI Responses
 *     native; AI SDK Chat Completions has no such field).
 *   - The `model` starts with "gpt-5." (gpt-5.1/5.2/5.3/5.4/5.x-codex etc.
 *     use Responses API natively).
 *   - Any tool in `tools[]` has a `type` other than "function" (e.g.
 *     `custom`, `web_search`, `image_generation`). These cannot be
 *     expressed in Chat Completions at all.
 *
 * Flat-shape function tools alone are NOT enough to trigger passthrough —
 * those are handled by the existing transform + normalize path, which
 * remains the code path for older clients and non-gpt-5 models.
 */
function isNativeResponsesPayload(body: Record<string, unknown>): boolean {
  // `instructions` is a Responses-API-only field. We treat ANY presence
  // of it (string or otherwise) as a signal that the client targets the
  // native Responses API — even malformed payloads (e.g.
  // `instructions: 42`) should route through the passthrough so the
  // upstream returns a coherent validation error rather than falling
  // through to the Chat Completions transform path which would choke
  // on the field entirely.
  if (body.instructions !== undefined && body.instructions !== null)
    return true;
  // gpt-5 and gpt-5.x (gpt-5, gpt-5-mini, gpt-5.1, gpt-5.2, gpt-5.3,
  // gpt-5.4, gpt-5.x-codex, ...). Any model whose id starts with "gpt-5"
  // uses the Responses API natively.
  if (typeof body.model === "string" && /^gpt-5(\b|[-.])/.test(body.model))
    return true;
  if (Array.isArray(body.tools)) {
    for (const tool of body.tools) {
      if (tool && typeof tool === "object") {
        const t = (tool as { type?: unknown }).type;
        if (typeof t === "string" && t !== "function") return true;
      }
    }
  }
  return false;
}

/**
 * Normalize a model id for Vercel AI Gateway's Responses API passthrough.
 *
 * Vercel AI Gateway requires `provider/model` format at `/v1/responses`
 * (e.g. `openai/gpt-5.4`, `anthropic/claude-sonnet-4.6`). Clients built
 * around OpenAI's native Responses API (Codex CLI, the AI SDK v5
 * Responses transport) send bare model ids like `gpt-5.4`, so we must
 * rewrite them.
 *
 * Rule: if the model id already contains `/`, leave it alone (respect
 * the caller's choice of provider). Otherwise, infer the provider from
 * a well-known prefix (openai/, anthropic/, google/) and default to
 * `openai/` as the fallback since that is the API shape we are in.
 */
function normalizeGatewayModelId(model: string): string {
  if (model.includes("/")) return model;
  if (/^claude/i.test(model)) return `anthropic/${model}`;
  if (/^gemini/i.test(model)) return `google/${model}`;
  // Default for the Responses API is OpenAI (Codex, gpt-5.x, gpt-4.x,
  // o1, o3, etc.).
  return `openai/${model}`;
}

/**
 * Proxy a native Responses-API request to the upstream Vercel AI Gateway
 * `/responses` endpoint, streaming the response back verbatim.
 *
 * Credit handling: we reserve credits based on estimateRequestCost (which
 * already applies a 50% safety buffer) and settle on completion. Accurate
 * reconciliation from the `response.completed` SSE event is a TODO — for
 * now the estimated amount stands, matching existing behavior for
 * streaming chat completions when usage parsing fails.
 */
async function handleNativeResponsesPassthrough(
  body: Record<string, unknown>,
  req: NextRequest,
  user: UserWithOrganization,
  apiKey: { id: string } | null,
  isAnonymous: boolean,
  startTime: number,
  routeTimeoutMs: number,
): Promise<Response> {
  const model = typeof body.model === "string" ? body.model : undefined;
  if (!model) {
    return Response.json(
      {
        error: {
          message: "Missing required field: model",
          type: "invalid_request_error",
          param: "model",
          code: "missing_required_parameter",
        },
      },
      { status: 400 },
    );
  }

  if (!hasResponsesRouteProviderConfigured(model)) {
    return Response.json(
      {
        error: {
          message: getResponsesRouteProviderConfigurationError(model),
          type: "service_unavailable",
          code: "provider_not_configured",
        },
      },
      { status: 503 },
    );
  }

  // Rewrite `model` to Vercel AI Gateway's `provider/model` format if
  // the client sent a bare id. We build a shallow clone rather than
  // mutating the caller's body.
  const gatewayModel = normalizeGatewayModelId(model);
  const needsModelRewrite = gatewayModel !== model;
  const bodyForUpstream: Record<string, unknown> = needsModelRewrite
    ? { ...body, model: gatewayModel }
    : body;
  if (needsModelRewrite) {
    logger.debug("[Responses API passthrough] rewrote model id for gateway", {
      original: model,
      gateway: gatewayModel,
    });
  }

  // Resolve the provider BEFORE reserving credits. If the provider
  // can't proxy Responses API we want to bail out cleanly without
  // touching the credits ledger — this avoids a reserve → refund
  // round-trip on every unsupported-provider request, and removes the
  // failure mode where a reservation could leak if the refund path
  // throws.
  //
  // We capture `providerResponses` here as a non-null local so the
  // narrowed type survives across the intervening credit reservation
  // block. This avoids both a redundant second null check before the
  // forward call and the `!` non-null assertion biome flagged.
  const { primary: providerInstance } = getProviderForModelWithFallback(model);
  const providerResponses = providerInstance.responses;
  if (!providerResponses) {
    return Response.json(
      {
        error: {
          message: `Provider does not support Responses API passthrough for model: ${model}`,
          type: "unsupported_provider",
          code: "unsupported_provider",
        },
      },
      { status: 400 },
    );
  }

  // Moderation: mirror the Chat Completions path. Extract the last user
  // text input for background moderation.
  try {
    if (await contentModerationService.shouldBlockUser(user.id)) {
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
  } catch (err) {
    logger.warn("[Responses API passthrough] moderation check failed", { err });
  }

  // Credit reservation. Anonymous users skip credit checks (message limits
  // apply elsewhere); authenticated users must have an organization.
  let reservedAmount = 0;
  let settleReservation: ((actualCost: number) => Promise<void>) | null = null;

  if (!isAnonymous) {
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

    // estimateRequestCost takes messages in OpenAI shape; for native
    // Responses payloads we approximate by flattening `input` items into
    // pseudo-messages. If estimation fails, fall back to a small default.
    let estimatedCost = 0;
    try {
      const pseudoMessages: Array<{ role: string; content: string }> =
        Array.isArray(body.input)
          ? (body.input as unknown[])
              .map((item) => {
                if (!item || typeof item !== "object") return null;
                const rec = item as Record<string, unknown>;
                const content = rec.content;
                if (typeof content === "string") {
                  return {
                    role: (rec.role as string) ?? "user",
                    content,
                  };
                }
                if (Array.isArray(content)) {
                  const text = content
                    .map((p) =>
                      p &&
                      typeof p === "object" &&
                      typeof (p as { text?: unknown }).text === "string"
                        ? (p as { text: string }).text
                        : "",
                    )
                    .join(" ");
                  return {
                    role: (rec.role as string) ?? "user",
                    content: text,
                  };
                }
                return null;
              })
              .filter((m): m is { role: string; content: string } => m !== null)
          : [];
      // pseudoMessages satisfies the looser
      // `Array<{ role: string; content: string | object }>` shape
      // estimateRequestCost expects — TypeScript widens `content` to
      // `string | object` implicitly at the call site.
      estimatedCost = await estimateRequestCost(
        model,
        pseudoMessages,
        typeof body.max_output_tokens === "number"
          ? body.max_output_tokens
          : undefined,
      );
    } catch (err) {
      logger.warn("[Responses API passthrough] estimateRequestCost failed", {
        err,
      });
      // Safety floor: when estimation fails we reserve a non-trivial
      // amount so an uncharged runaway session can't drain credits.
      // The Chat Completions path benefits from `estimateRequestCost`'s
      // 50% safety buffer, which we're bypassing here, so we set a
      // higher floor than the cheapest possible turn to compensate.
      // Real cost is reconciled against the reserved amount on stream
      // close (see settleReservation below); over-reservation refunds
      // automatically if the actual ends up lower.
      estimatedCost = 0.1;
    }

    reservedAmount = estimatedCost;
    const reservationResult = await creditsService.reserveAndDeductCredits({
      organizationId: user.organization_id,
      amount: reservedAmount,
      description: `Responses API native passthrough (reserved): ${model}`,
      metadata: {
        user_id: user.id,
        api_key_id: apiKey?.id ?? null,
        type: "reservation",
        estimated: true,
        passthrough: true,
      },
    });

    if (!reservationResult.success) {
      logger.warn("[Responses API passthrough] Insufficient credits", {
        organizationId: user.organization_id,
        estimatedCost,
      });
      return Response.json(
        {
          error: {
            message: `Insufficient credits. Required: ~${estimatedCost.toFixed(4)}.`,
            type: "insufficient_credits",
            code: "insufficient_credits",
          },
        },
        { status: 402 },
      );
    }

    const organizationId = user.organization_id;
    const apiKeyId = apiKey?.id ?? null;
    settleReservation = async (actualCost: number) => {
      try {
        await creditsService.reconcile({
          organizationId,
          reservedAmount,
          actualCost,
          description: `Responses API native passthrough (reconciled): ${model}`,
          metadata: {
            user_id: user.id,
            api_key_id: apiKeyId,
            passthrough: true,
          },
        });
      } catch (err) {
        logger.error("[Responses API passthrough] reconcile failed", { err });
      }
    };
  }

  // `providerResponses` is the non-null local captured at the top of
  // the handler — see the early-bail check above for the rationale.
  let upstreamResponse: Response;
  try {
    upstreamResponse = await providerResponses(bodyForUpstream, {
      signal: req.signal,
      timeoutMs: routeTimeoutMs,
    });
  } catch (err) {
    await settleReservation?.(0);
    logger.error("[Responses API passthrough] upstream fetch failed", { err });
    // Propagate structured gateway errors when available — but
    // sanitize the payload before forwarding so we don't leak gateway
    // internals (stack traces, infrastructure host names, etc.) to
    // end clients.
    if (err && typeof err === "object" && "error" in err && "status" in err) {
      const gwErr = err as { status: number; error: unknown };
      return Response.json(
        { error: sanitizeGatewayError(gwErr.error) },
        { status: gwErr.status },
      );
    }
    return Response.json(
      {
        error: {
          message:
            err instanceof Error ? err.message : "Upstream request failed",
          type: "api_error",
          code: "upstream_error",
        },
      },
      { status: 502 },
    );
  }

  // If upstream returned an error, settle reservation (refund) and
  // forward the error verbatim.
  if (!upstreamResponse.ok) {
    await settleReservation?.(0);
    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: buildPassthroughResponseHeaders(upstreamResponse.headers),
    });
  }

  // Credit reservation settlement, dispatched on response shape:
  //
  //   - STREAMING responses (text/event-stream): we wrap the upstream
  //     ReadableStream with `wrapWithUsageExtraction` so bytes flow to
  //     the client unchanged AND the wrapper extracts `response.usage`
  //     from the terminal `response.completed` SSE event. Settlement
  //     fires when the stream actually ends (or is cancelled / errors)
  //     so we reconcile to actual cost rather than the reservation
  //     upper bound. Exactly one terminal callback is guaranteed.
  //
  //   - NON-STREAMING responses (JSON, etc.): the body is already
  //     fully materialized, so there is no value in deferring
  //     settlement. We `await` it synchronously before returning the
  //     Response so the reservation can't be stranded by a serverless
  //     function freeze (Vercel can terminate the invocation once the
  //     Response is sent, which would orphan a background promise).
  //     For non-streaming we don't have an SSE stream to parse, so
  //     we settle to the reserved estimate; the 50% safety buffer in
  //     `estimateRequestCost` is the upper bound.
  //
  //   - NO BODY (headers-only upstream response, edge case): also
  //     synchronously settle to reserved so the reservation isn't
  //     stranded.
  const upstreamContentType =
    upstreamResponse.headers.get("content-type") ?? "";
  const isStreamingResponse = upstreamContentType.includes("text/event-stream");

  let reconciledBody: ReadableStream<Uint8Array> | null = null;
  if (isStreamingResponse && upstreamResponse.body) {
    // Streaming path: stream wrapper handles its own reconciliation
    // via the runReconciliation callback below.
    const providerName = getProviderFromModel(model);
    const runReconciliation = async (
      usage: ResponsesUsage | null,
    ): Promise<void> => {
      if (!settleReservation) return;
      if (!usage) {
        try {
          await settleReservation(reservedAmount);
        } catch (err) {
          logger.warn("[Responses API passthrough] fallback settle failed", {
            err,
          });
        }
        return;
      }
      try {
        const { totalCost } = await calculateCost(
          normalizeModelName(model),
          providerName,
          usage.inputTokens,
          usage.outputTokens,
        );
        // Cap actual cost at the reservation. If the model somehow
        // ran hotter than we reserved we can't retroactively collect
        // more from the user via this path — any shortfall would
        // need a separate post-hoc ledger entry, which is out of
        // scope here.
        const actualCost = Math.min(totalCost, reservedAmount);
        await settleReservation(actualCost);
      } catch (err) {
        logger.warn(
          "[Responses API passthrough] cost calculation failed, settling to reserved",
          {
            err,
          },
        );
        try {
          await settleReservation(reservedAmount);
        } catch (innerErr) {
          logger.warn(
            "[Responses API passthrough] fallback settle also failed",
            { err: innerErr },
          );
        }
      }
    };

    reconciledBody = wrapWithUsageExtraction(
      upstreamResponse.body,
      (usage, reason) => {
        logger.debug("[Responses API passthrough] stream terminated", {
          userId: user.id,
          reason,
          sawUsage: usage !== null,
          inputTokens: usage?.inputTokens,
          outputTokens: usage?.outputTokens,
        });
        void runReconciliation(usage);
      },
    );
  } else if (settleReservation) {
    // Non-streaming OR no-body path: settle synchronously so a
    // serverless function freeze can't strand the reservation.
    try {
      await settleReservation(reservedAmount);
    } catch (err) {
      logger.warn("[Responses API passthrough] synchronous settle failed", {
        err,
      });
    }
  }

  // Build the client-visible response headers. Start from the upstream
  // headers and strip:
  //   (a) hop-by-hop headers that would confuse the client because the
  //       bytes have been re-emitted into a new HTTP response,
  //   (b) gateway-internal headers that leak infrastructure details
  //       (Vercel AI Gateway, Cloudflare) without being useful to the
  //       end client.
  //
  // We intentionally DO forward `x-ratelimit-*` headers so clients can
  // observe their remaining budget upstream — that is the whole point
  // of passthrough transparency.
  const outHeaders = buildPassthroughResponseHeaders(upstreamResponse.headers);

  const durationMs = Date.now() - startTime;
  logger.info("[Responses API passthrough] forwarded upstream response", {
    model,
    status: upstreamResponse.status,
    userId: user.id,
    apiKeyId: apiKey?.id ?? null,
    anonymous: isAnonymous,
    durationMs,
  });

  return new Response(reconciledBody ?? upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: outHeaders,
  });
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
/**
 * Hard cap on request body size for the /v1/responses route.
 *
 * 4 MiB is generous enough for a gpt-5.x Codex session including a
 * multi-kilobyte `apply_patch` grammar definition, custom tools with
 * full JSON schemas, and ~30 prior turns of conversation history, but
 * small enough to stop an abusive client from streaming unbounded
 * payloads through the proxy. Chat Completions is currently
 * unguarded; this adds explicit protection on the passthrough route
 * where we are most exposed because we forward bodies upstream
 * verbatim.
 */
const MAX_RESPONSES_BODY_BYTES = 4 * 1024 * 1024;

async function handlePOST(req: NextRequest) {
  const startTime = Date.now();
  const routeTimeoutMs = getRouteTimeoutMs(maxDuration);
  let settleReservation: ((actualCost: number) => Promise<void>) | null = null;

  try {
    // Body size guard. The `Content-Length` header is a hint rather
    // than a guarantee (clients can lie, chunked encoding omits it),
    // but most legitimate clients do set it and rejecting early here
    // means we don't burn a credit reservation or an upstream fetch
    // on requests that will obviously be too big.
    const contentLengthHeader = req.headers.get("content-length");
    if (contentLengthHeader) {
      const contentLength = Number.parseInt(contentLengthHeader, 10);
      if (
        Number.isFinite(contentLength) &&
        contentLength > MAX_RESPONSES_BODY_BYTES
      ) {
        logger.warn("[Responses API] rejecting oversized request body", {
          contentLength,
          limit: MAX_RESPONSES_BODY_BYTES,
        });
        return Response.json(
          {
            error: {
              message: `Request body exceeds ${MAX_RESPONSES_BODY_BYTES} bytes`,
              type: "invalid_request_error",
              code: "request_too_large",
            },
          },
          { status: 413 },
        );
      }
    }

    // 1. Authenticate - Support both authenticated and anonymous users
    let user: UserWithOrganization;
    let apiKey;
    let isAnonymous = false;

    try {
      const authResult = await requireAuthOrApiKey(req);
      user = authResult.user;
      apiKey = authResult.apiKey;
    } catch (_authError) {
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
        try {
          const newAnonData = await getOrCreateAnonymousUser();
          user = newAnonData.user;
          isAnonymous = true;
          logger.info("[Responses API] Created anonymous user:", user.id);
        } catch (error) {
          logger.warn("[Responses API] Anonymous fallback unavailable", {
            error: getSafeErrorMessage(error),
          });
          return Response.json(
            {
              error: {
                message: "Authentication required",
                type: "authentication_error",
              },
            },
            { status: 401 },
          );
        }
      }
    }

    // Per-org tier rate limit (skipped for anonymous users — they use the outer withRateLimit)
    if (user.organization_id) {
      const orgRateLimited = await enforceOrgRateLimit(
        user.organization_id,
        "completions",
      );
      if (orgRateLimited) return orgRateLimited;
    }

    // 2. Read the body as text first so we can enforce the actual size
    // limit AFTER buffering — `Content-Length` is a hint clients can
    // omit (chunked transfer encoding) or lie about. The text-based
    // check is the real enforcement; the header check above is just
    // an early fast path to reject obvious oversize requests before
    // we burn time reading them.
    let rawBody: Record<string, unknown>;
    try {
      const bodyText = await req.text();
      const actualBodyBytes = Buffer.byteLength(bodyText, "utf8");
      if (actualBodyBytes > MAX_RESPONSES_BODY_BYTES) {
        logger.warn(
          "[Responses API] rejecting oversized request body (post-read)",
          {
            actualBytes: actualBodyBytes,
            limit: MAX_RESPONSES_BODY_BYTES,
          },
        );
        return Response.json(
          {
            error: {
              message: `Request body exceeds ${MAX_RESPONSES_BODY_BYTES} bytes`,
              type: "invalid_request_error",
              code: "request_too_large",
            },
          },
          { status: 413 },
        );
      }
      try {
        const parsedBody: unknown = JSON.parse(bodyText);
        if (
          !parsedBody ||
          typeof parsedBody !== "object" ||
          Array.isArray(parsedBody)
        ) {
          return Response.json(
            {
              error: {
                message: "Request body must be a JSON object",
                type: "invalid_request_error",
                code: "invalid_json",
              },
            },
            { status: 400 },
          );
        }
        rawBody = parsedBody as Record<string, unknown>;
      } catch (parseErr) {
        logger.warn("[Responses API] malformed JSON request body", {
          err: parseErr instanceof Error ? parseErr.message : String(parseErr),
        });
        return Response.json(
          {
            error: {
              message: "Request body is not valid JSON",
              type: "invalid_request_error",
              code: "invalid_json",
            },
          },
          { status: 400 },
        );
      }
    } catch (readErr) {
      logger.warn("[Responses API] failed to read request body", {
        err: readErr instanceof Error ? readErr.message : String(readErr),
      });
      return Response.json(
        {
          error: {
            message: "Failed to read request body",
            type: "invalid_request_error",
            code: "body_read_failed",
          },
        },
        { status: 400 },
      );
    }

    // 2a. Native Responses-API passthrough path.
    //
    // gpt-5.x models (Codex CLI, the AI SDK Responses transport) use
    // Responses-API-only features that cannot be expressed in the Chat
    // Completions format our downstream transform targets:
    //
    //   - flat tools `{type: "function", name, parameters}` (handled by
    //     normalization but the downstream response shape then loses
    //     Responses-API features like `instructions`, `reasoning.effort`,
    //     encrypted reasoning content, prompt_cache_key, etc.)
    //   - custom tools `{type: "custom", name, format}` (apply_patch)
    //   - built-in tools `{type: "web_search"}`, `image_generation`, etc.
    //   - top-level `instructions` and `input` fields
    //
    // When we detect a native Responses payload, skip the AI-SDK → Chat
    // Completions transform entirely and proxy the raw body to the
    // Vercel AI Gateway `/responses` passthrough, streaming the upstream
    // response back verbatim.
    if (isNativeResponsesPayload(rawBody)) {
      return await handleNativeResponsesPassthrough(
        rawBody,
        req,
        user,
        apiKey ?? null,
        isAnonymous,
        startTime,
        routeTimeoutMs,
      );
    }

    const aiSdkRequest = rawBody as unknown as AISdkRequest;

    // 3. Transform to OpenAI format
    const request = transformAISdkToOpenAI(aiSdkRequest);

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
    // Filter out empty system messages (characters may not have system prompts configured)
    request.messages = request.messages.filter((msg, i) => {
      if (
        msg.role === "system" &&
        (!msg.content ||
          (typeof msg.content === "string" && msg.content.trim() === ""))
      ) {
        logger.debug("[Responses API] Filtering out empty system message", {
          messageIndex: i,
        });
        return false;
      }
      return true;
    });

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

        // Validate array content has non-empty text blocks (Anthropic API requirement)
        if (Array.isArray(msg.content)) {
          const hasValidTextContent = msg.content.some((part) => {
            if (typeof part === "object" && part !== null && "type" in part) {
              const typedPart = part as { type: string; text?: string };
              if (
                typedPart.type === "text" ||
                typedPart.type === "input_text"
              ) {
                return (
                  typeof typedPart.text === "string" &&
                  typedPart.text.trim() !== ""
                );
              }
              // Non-text parts (images) are valid
              return true;
            }
            return false;
          });

          // If we have a content array but no valid content, and no tool calls, reject
          if (
            !hasValidTextContent &&
            !hasToolCalls &&
            !hasToolCallId &&
            !hasFunctionCall
          ) {
            logger.warn(
              "[Responses API] Content array has no valid text content",
              {
                messageIndex: i,
                role: msg.role,
                contentLength: msg.content.length,
              },
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
    }

    // Check if user is blocked due to moderation violations
    if (await contentModerationService.shouldBlockUser(user.id)) {
      logger.warn("[Responses API] User blocked due to moderation violations", {
        userId: user.id,
      });
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
            logger.warn("[Responses API] Async moderation detected violation", {
              userId: user.id,
              categories: result.flaggedCategories,
              action: result.action,
            });
          },
        );
      }
    }

    const model = request.model;
    if (!hasResponsesRouteProviderConfigured(model)) {
      return Response.json(
        {
          error: {
            message: getResponsesRouteProviderConfigurationError(model),
            type: "service_unavailable",
            code: "provider_not_configured",
          },
        },
        { status: 503 },
      );
    }
    const provider = getProviderFromModel(model);
    const normalizedModel = normalizeModelName(model);
    const isStreaming = request.stream ?? false;
    const trajectoryContext = buildTrajectoryContext(req, request);

    // 5. DEDUCT credits BEFORE making API call (prevents TOCTOU race condition)
    // Skip for anonymous users - they use message limits instead
    const estimatedCost = await estimateRequestCost(
      model,
      request.messages,
      aiSdkRequest.max_output_tokens,
    );
    const _org = null;
    let reservedAmount = 0;

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

      // estimateRequestCost() already includes a 50% safety buffer,
      // so no additional multiplier is needed here
      reservedAmount = estimatedCost;

      // Atomically deduct credits BEFORE calling the API
      // This prevents race conditions where multiple requests pass the check
      const reservationResult = await creditsService.reserveAndDeductCredits({
        organizationId: user.organization_id,
        amount: reservedAmount,
        description: `Responses API (reserved): ${model}`,
        metadata: { user_id: user.id, type: "reservation", estimated: true },
      });

      if (!reservationResult.success) {
        logger.warn("[Responses API] Insufficient credits", {
          organizationId: user.organization_id,
          required: reservedAmount,
          reason: reservationResult.reason,
        });

        return Response.json(
          {
            error: {
              message: `Insufficient balance. Required: $${reservedAmount.toFixed(2)}`,
              type: "insufficient_quota",
              code: "insufficient_balance",
            },
          },
          { status: 402 },
        );
      }
    } // End of non-anonymous credit deduction block

    let reservationSettled = false;
    settleReservation = async (actualCost: number) => {
      if (reservationSettled || !user.organization_id || !reservedAmount)
        return;

      reservationSettled = true;

      try {
        await creditsService.reconcile({
          organizationId: user.organization_id,
          reservedAmount,
          actualCost,
          description: `Responses API: ${normalizedModel}`,
          metadata: { user_id: user.id },
        });
      } catch (error) {
        reservationSettled = false;
        throw error;
      }
    };

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
    // Strip unsupported params for Anthropic models to avoid gateway warnings
    const safeRequest = { ...request };
    const modelProvider = getProviderFromModel(model);
    if (modelProvider === "anthropic") {
      delete safeRequest.frequency_penalty;
      delete safeRequest.presence_penalty;
    }
    if (isReasoningModel(model)) {
      delete safeRequest.temperature;
    }

    const { primary: providerInstance, fallback: fallbackProvider } =
      getProviderForModelWithFallback(model);
    // Gateway: Groq preference + optional ANTHROPIC_COT_BUDGET (providerOptions.anthropic.thinking) per AI Gateway docs.
    const requestWithProvider = isGroqNativeModel(model)
      ? safeRequest
      : {
          ...safeRequest,
          ...mergeGatewayGroqPreferenceWithAnthropicCot(model),
        };
    const providerResponse = await withProviderFallback(
      () =>
        providerInstance.chatCompletions(requestWithProvider, {
          signal: req.signal,
          timeoutMs: routeTimeoutMs,
        }),
      fallbackProvider
        ? () =>
            fallbackProvider.chatCompletions(requestWithProvider, {
              signal: req.signal,
              timeoutMs: routeTimeoutMs,
            })
        : null,
    );

    // 7. Handle streaming vs non-streaming
    if (isStreaming) {
      return handleStreamingResponse(
        providerResponse,
        user,
        apiKey ?? null,
        normalizedModel,
        provider,
        startTime,
        trajectoryContext,
        request.messages,
        reservedAmount,
        settleReservation,
      );
    } else {
      return handleNonStreamingResponse(
        providerResponse,
        user,
        apiKey ?? null,
        normalizedModel,
        provider,
        startTime,
        trajectoryContext,
        reservedAmount,
        settleReservation,
      );
    }
  } catch (error) {
    await settleReservation?.(0);

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
      const gatewayStatus = (error as { status: unknown }).status;
      if (typeof gatewayStatus === "number") {
        const gatewayError = error as GatewayError;
        return Response.json(
          { error: gatewayError.error },
          { status: gatewayError.status },
        );
      }
    }

    if (getErrorStatusCode(error) === 401) {
      const message = error instanceof Error ? error.message : "Unauthorized";
      return Response.json(
        {
          error: {
            message,
            type: "authentication_error",
            code: "unauthorized",
          },
        },
        { status: 401 },
      );
    }

    logger.error("[Responses API] Error:", error);

    const status = getErrorStatusCode(error);
    const clientMessage =
      status >= 500 ? "Internal server error" : getSafeErrorMessage(error);
    const code =
      status === 402
        ? "insufficient_credits"
        : status === 403
          ? "forbidden"
          : status === 404
            ? "not_found"
            : status === 429
              ? "rate_limit_exceeded"
              : "internal_server_error";

    return Response.json(
      {
        error: {
          message: clientMessage,
          type: "api_error",
          code,
        },
      },
      { status },
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
  trajectoryContext: ResponsesTrajectoryContext,
  reservedAmount?: number,
  settleReservation?: (actualCost: number) => Promise<void>,
) {
  // Parse response
  const data: OpenAIChatResponse = await providerResponse.json();

  // Extract usage
  const usage = data.usage;
  const content = data.choices[0]?.message?.content || "";

  // Reconcile credits: refund difference if actual < reserved
  if (!usage) {
    await settleReservation?.(0);
    logger.warn("[Responses API] Non-streaming response missing usage data", {
      model,
    });
  } else if (user.organization_id && reservedAmount) {
    const organizationId = user.organization_id;
    const { inputCost, outputCost, totalCost } = await calculateCost(
      model,
      provider,
      usage.prompt_tokens,
      usage.completion_tokens,
    );

    await settleReservation?.(totalCost);

    // Background analytics (usage records, generation records)
    (async () => {
      try {
        const usageRecord = await usageService.create({
          organization_id: organizationId,
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
            organization_id: organizationId,
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

        await logResponsesTrajectory({
          user,
          apiKey,
          model,
          provider,
          startTime,
          inputTokens: usage.prompt_tokens,
          outputTokens: usage.completion_tokens,
          inputCost,
          outputCost,
          responseText: content,
          context: trajectoryContext,
        });

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

  return Response.json(aiSdkResponse);
}

// Handle streaming response - transforms OpenAI SSE to AI SDK streaming protocol
function handleStreamingResponse(
  providerResponse: Response,
  user: { organization_id: string | null; id: string },
  apiKey: { id: string } | null,
  model: string,
  provider: string,
  startTime: number,
  trajectoryContext: ResponsesTrajectoryContext,
  messages: Array<{ role: string; content: string | object }>,
  reservedAmount?: number,
  settleReservation?: (actualCost: number) => Promise<void>,
) {
  let totalTokens = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let fullContent = "";

  // Create transform stream to convert OpenAI format to AI SDK streaming protocol
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  // Helper to write AI SDK streaming events with backpressure handling
  // AI SDK expects just "data:" lines with type in the JSON payload, NOT "event:" lines
  const writeEvent = async (data: object) => {
    await writer.ready;
    const dataLine = `data: ${JSON.stringify(data)}\n\n`;
    await writer.write(encoder.encode(dataLine));
  };

  // Process stream in background
  (async () => {
    try {
      const reader = providerResponse.body?.getReader();
      if (!reader) throw new Error("No response body");

      let responseId = "";
      let responseModel = model;
      let createdAt = Math.floor(Date.now() / 1000);
      let sentCreated = false;
      let sentOutputItemAdded = false;
      const itemId = `msg_${Date.now()}`;
      const outputIndex = 0;

      // Buffer for handling partial chunks that split across network boundaries
      let lineBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Append to buffer using streaming mode to handle multi-byte chars properly
        lineBuffer += decoder.decode(value, { stream: true });

        // Split into lines, keeping last potentially incomplete line in buffer
        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") {
              // Send response.output_item.done event
              await writeEvent({
                type: "response.output_item.done",
                output_index: outputIndex,
                item: {
                  type: "message",
                  id: itemId,
                  role: "assistant",
                  content: [
                    { type: "output_text", text: fullContent, annotations: [] },
                  ],
                  status: "completed",
                },
              });

              // Send response.completed event
              await writeEvent({
                type: "response.completed",
                response: {
                  id: responseId,
                  object: "response",
                  created_at: createdAt,
                  model: responseModel,
                  status: "completed",
                  incomplete_details: null,
                  output: [
                    {
                      type: "message",
                      id: itemId,
                      role: "assistant",
                      content: [
                        {
                          type: "output_text",
                          text: fullContent,
                          annotations: [],
                        },
                      ],
                      status: "completed",
                    },
                  ],
                  usage: {
                    input_tokens: inputTokens,
                    output_tokens: outputTokens,
                    total_tokens: totalTokens,
                  },
                  error: null,
                },
              });
              continue;
            }
            if (!data.trim()) continue;

            try {
              const parsed = JSON.parse(data);

              // Extract metadata from first chunk
              if (!responseId && parsed.id) {
                responseId = parsed.id;
                responseModel = parsed.model || model;
                createdAt = parsed.created || Math.floor(Date.now() / 1000);
              }

              // Send response.created event on first chunk
              if (!sentCreated) {
                sentCreated = true;
                await writeEvent({
                  type: "response.created",
                  response: {
                    id: responseId,
                    object: "response",
                    created_at: createdAt,
                    model: responseModel,
                    status: "in_progress",
                    incomplete_details: null,
                    output: [],
                    usage: null,
                    error: null,
                  },
                });
              }

              // Send response.output_item.added on first content chunk
              if (!sentOutputItemAdded) {
                sentOutputItemAdded = true;
                await writeEvent({
                  type: "response.output_item.added",
                  output_index: outputIndex,
                  item: {
                    type: "message",
                    id: itemId,
                    role: "assistant",
                    content: [],
                    status: "in_progress",
                  },
                });
              }

              // Extract and emit text deltas
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullContent += content;
                await writeEvent({
                  type: "response.output_text.delta",
                  item_id: itemId,
                  output_index: outputIndex,
                  content_index: 0,
                  delta: content,
                });
              }

              // Extract usage from final chunk (if available)
              if (parsed.usage) {
                inputTokens = parsed.usage.prompt_tokens || 0;
                outputTokens = parsed.usage.completion_tokens || 0;
                totalTokens = parsed.usage.total_tokens || 0;
              }
            } catch (parseError) {
              // Log parsing failures as warnings - silent failures are hard to debug
              logger.warn("[Responses API] Failed to parse streaming chunk", {
                line: line.substring(0, 200), // Truncate to avoid log spam
                error:
                  parseError instanceof Error
                    ? parseError.message
                    : String(parseError),
              });
            }
          }
        }
      }

      // Flush decoder and process any remaining buffered content
      const finalChunk = decoder.decode();
      if (finalChunk) {
        lineBuffer += finalChunk;
      }

      // Process any remaining complete line in buffer
      if (lineBuffer.trim() && lineBuffer.startsWith("data: ")) {
        const data = lineBuffer.slice(6);
        if (data !== "[DONE]" && data.trim()) {
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullContent += content;
              await writeEvent({
                type: "response.output_text.delta",
                item_id: itemId,
                output_index: outputIndex,
                content_index: 0,
                delta: content,
              });
            }
            if (parsed.usage) {
              inputTokens = parsed.usage.prompt_tokens || 0;
              outputTokens = parsed.usage.completion_tokens || 0;
              totalTokens = parsed.usage.total_tokens || 0;
            }
          } catch {
            // Final buffer wasn't a complete JSON - this is expected if the stream ended cleanly
          }
        }
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

        // Reconcile credits: refund difference if actual < reserved
        if (user.organization_id && reservedAmount) {
          await settleReservation?.(totalCost);
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

          await logResponsesTrajectory({
            user,
            apiKey,
            model,
            provider,
            startTime,
            inputTokens,
            outputTokens,
            inputCost,
            outputCost,
            responseText: fullContent,
            context: trajectoryContext,
          });

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
      await settleReservation?.(0);
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

export const POST = withRateLimit(handlePOST, RateLimitPresets.RELAXED);

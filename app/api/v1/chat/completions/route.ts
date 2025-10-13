// app/api/v1/chat/completions/route.ts
import { requireAuthOrApiKey } from "@/lib/auth";
import { VercelGatewayProvider } from "@/lib/providers/vercel-gateway";
import { deductCredits } from "@/lib/queries/credits";
import { createUsageRecord } from "@/lib/queries/usage";
import { createGeneration } from "@/lib/queries/generations";
import { calculateCost, getProviderFromModel } from "@/lib/pricing";
import { logger } from "@/lib/utils/logger";
import type { NextRequest } from "next/server";
import type {
  OpenAIChatRequest,
  OpenAIChatResponse,
} from "@/lib/providers/types";

export const maxDuration = 60;

// Initialize provider
const getProvider = () => {
  const apiKey = process.env.VERCEL_AI_GATEWAY_API_KEY || process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) {
    throw new Error("VERCEL_AI_GATEWAY_API_KEY or AI_GATEWAY_API_KEY not configured");
  }
  return new VercelGatewayProvider(apiKey);
};

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    // 1. Authenticate
    const { user, apiKey } = await requireAuthOrApiKey(req);

    // 2. Parse request (already in OpenAI format!)
    const request: OpenAIChatRequest = await req.json();

    // 3. Validate
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

    const model = request.model;
    const provider = getProviderFromModel(model);
    const isStreaming = request.stream ?? false;

    logger.info("[OpenAI Proxy] Chat completion request", {
      organizationId: user.organization_id,
      userId: user.id,
      model,
      streaming: isStreaming,
      messageCount: request.messages.length,
    });

    // 4. Forward to Vercel AI Gateway
    const providerInstance = getProvider();
    const providerResponse = await providerInstance.chatCompletions(request);

    // 5. Handle streaming vs non-streaming
    if (isStreaming) {
      return handleStreamingResponse(
        providerResponse,
        user,
        apiKey ?? null,
        model,
        provider,
        startTime,
      );
    } else {
      return handleNonStreamingResponse(
        providerResponse,
        user,
        apiKey ?? null,
        model,
        provider,
        startTime,
      );
    }
  } catch (error) {
    logger.error("[OpenAI Proxy] Error:", error);

    // Return OpenAI-formatted error
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
) {
  // Parse response
  const data: OpenAIChatResponse = await providerResponse.json();

  // Extract usage
  const usage = data.usage;
  const content = data.choices[0]?.message?.content || "";

  // Background analytics (async, don't block response)
  if (usage) {
    (async () => {
      try {
        const { inputCost, outputCost, totalCost } = await calculateCost(
          model,
          provider,
          usage.prompt_tokens,
          usage.completion_tokens,
        );

        await deductCredits(
          user.organization_id,
          totalCost,
          `OpenAI Proxy: ${model}`,
          user.id,
        );

        const usageRecord = await createUsageRecord({
          organization_id: user.organization_id,
          user_id: user.id,
          api_key_id: apiKey?.id || null,
          type: "chat",
          model,
          provider: "vercel-gateway",
          input_tokens: usage.prompt_tokens,
          output_tokens: usage.completion_tokens,
          input_cost: inputCost,
          output_cost: outputCost,
          is_successful: true,
        });

        if (apiKey) {
          await createGeneration({
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
            cost: totalCost,
            credits: totalCost,
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
          cost: totalCost,
        });
      } catch (error) {
        logger.error("[OpenAI Proxy] Analytics error:", error);
      }
    })().catch((err) => {
      logger.error("[OpenAI Proxy] Background operation failed:", err);
    });
  }

  // Return response immediately (don't wait for analytics)
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
      if (totalTokens > 0) {
        const { inputCost, outputCost, totalCost } = await calculateCost(
          model,
          provider,
          inputTokens,
          outputTokens,
        );

        await deductCredits(
          user.organization_id,
          totalCost,
          `OpenAI Proxy: ${model}`,
          user.id,
        );

        const usageRecord = await createUsageRecord({
          organization_id: user.organization_id,
          user_id: user.id,
          api_key_id: apiKey?.id || null,
          type: "chat",
          model,
          provider: "vercel-gateway",
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          input_cost: inputCost,
          output_cost: outputCost,
          is_successful: true,
        });

        if (apiKey) {
          await createGeneration({
            organization_id: user.organization_id,
            user_id: user.id,
            api_key_id: apiKey.id,
            type: "chat",
            model,
            provider: "vercel-gateway",
            prompt: "", // Could extract from request
            status: "completed",
            content: fullContent,
            tokens: totalTokens,
            cost: totalCost,
            credits: totalCost,
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
          cost: totalCost,
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


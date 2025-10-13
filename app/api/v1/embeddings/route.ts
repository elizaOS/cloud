// app/api/v1/embeddings/route.ts
import { requireAuthOrApiKey } from "@/lib/auth";
import { deductCredits } from "@/lib/queries/credits";
import { createUsageRecord } from "@/lib/queries/usage";
import { logger } from "@/lib/utils/logger";
import type { NextRequest } from "next/server";

export const maxDuration = 60;

interface OpenAIEmbeddingsRequest {
  input: string | string[];
  model: string;
  encoding_format?: "float" | "base64";
  dimensions?: number;
  user?: string;
}

interface OpenAIEmbeddingsResponse {
  object: "list";
  data: Array<{
    object: "embedding";
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export async function POST(req: NextRequest) {
  try {
    const { user, apiKey } = await requireAuthOrApiKey(req);
    const request: OpenAIEmbeddingsRequest = await req.json();

    if (!request.model || !request.input) {
      return Response.json(
        {
          error: {
            message: "Missing required fields: model and input",
            type: "invalid_request_error",
            param: !request.model ? "model" : "input",
            code: "missing_required_parameter",
          },
        },
        { status: 400 },
      );
    }

    const gatewayKey = process.env.VERCEL_AI_GATEWAY_API_KEY || process.env.AI_GATEWAY_API_KEY;
    if (!gatewayKey) {
      throw new Error("VERCEL_AI_GATEWAY_API_KEY or AI_GATEWAY_API_KEY not configured");
    }

    // Forward to Vercel AI Gateway
    const response = await fetch(
      "https://ai-gateway.vercel.sh/v1/embeddings",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${gatewayKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gateway error: ${response.status} ${error}`);
    }

    const data: OpenAIEmbeddingsResponse = await response.json();

    // Background analytics
    if (data.usage) {
      (async () => {
        try {
          // Simplified cost calculation for embeddings
          const tokensUsed = data.usage.total_tokens;
          const costPerToken = 0.0001 / 1000; // Example rate
          const totalCost = Math.round(tokensUsed * costPerToken * 1000000) / 1000000; // Round to avoid scientific notation

          await deductCredits(
            user.organization_id,
            totalCost,
            `OpenAI Proxy Embeddings: ${request.model}`,
            user.id,
          );

          await createUsageRecord({
            organization_id: user.organization_id,
            user_id: user.id,
            api_key_id: apiKey?.id || null,
            type: "embeddings",
            model: request.model,
            provider: "vercel-gateway",
            input_tokens: data.usage.prompt_tokens,
            output_tokens: 0,
            input_cost: totalCost,
            output_cost: 0,
            is_successful: true,
          });

          logger.info("[OpenAI Proxy] Embeddings completed", {
            model: request.model,
            tokens: tokensUsed,
            cost: totalCost,
          });
        } catch (error) {
          logger.error("[OpenAI Proxy] Embeddings analytics error:", error);
        }
      })().catch(() => {});
    }

    return Response.json(data);
  } catch (error) {
    logger.error("[OpenAI Proxy] Embeddings error:", error);
    return Response.json(
      {
        error: {
          message:
            error instanceof Error ? error.message : "Internal server error",
          type: "api_error",
        },
      },
      { status: 500 },
    );
  }
}


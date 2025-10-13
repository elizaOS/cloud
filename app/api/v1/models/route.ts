import { requireAuthOrApiKey } from "@/lib/auth";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

interface OpenAIModel {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
}

interface OpenAIModelsResponse {
  object: "list";
  data: OpenAIModel[];
}

export async function GET(request: NextRequest) {
  try {
    await requireAuthOrApiKey(request);

    const gatewayKey = process.env.VERCEL_AI_GATEWAY_API_KEY || process.env.AI_GATEWAY_API_KEY;
    if (!gatewayKey) {
      throw new Error("VERCEL_AI_GATEWAY_API_KEY or AI_GATEWAY_API_KEY not configured");
    }

    // Forward to Vercel AI Gateway with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 seconds
    
    let response: Response;
    try {
      response = await fetch("https://ai-gateway.vercel.sh/v1/models", {
        headers: {
          Authorization: `Bearer ${gatewayKey}`,
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error("Gateway request timeout");
      }
      throw error;
    }

    if (!response.ok) {
      throw new Error(`Gateway error: ${response.status}`);
    }

    const data: OpenAIModelsResponse = await response.json();

    // Return OpenAI-compatible format
    return Response.json(data);
  } catch (error) {
    console.error("Error fetching models:", error);
    return Response.json(
      {
        error: {
          message: "Failed to fetch available models",
          type: "api_error",
        },
      },
      { status: 500 },
    );
  }
}

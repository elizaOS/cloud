// lib/providers/vercel-gateway.ts
import type { AIProvider, OpenAIChatRequest } from "./types";
import { logger } from "@/lib/utils/logger";

export class VercelGatewayProvider implements AIProvider {
  name = "vercel-gateway";
  private baseUrl = "https://ai-gateway.vercel.sh/v1";
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("Vercel AI Gateway API key is required");
    }
    this.apiKey = apiKey;
  }

  async chatCompletions(request: OpenAIChatRequest): Promise<Response> {
    logger.debug("[Vercel Gateway] Forwarding chat completion request", {
      model: request.model,
      streaming: request.stream,
      messageCount: request.messages.length,
    });

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error("[Vercel Gateway] Request failed", {
        status: response.status,
        error,
      });
      throw new Error(`Vercel Gateway error: ${response.status} ${error}`);
    }

    return response;
  }
}


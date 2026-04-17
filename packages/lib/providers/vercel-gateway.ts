/**
 * Vercel AI Gateway provider implementation.
 *
 * Provides OpenAI-compatible API access through Vercel AI Gateway.
 */

import { logger } from "@/lib/utils/logger";
import type {
  AIProvider,
  OpenAIChatRequest,
  OpenAIEmbeddingsRequest,
  ProviderRequestOptions,
} from "./types";

/**
 * Gateway error response structure.
 */
interface GatewayError {
  error: {
    message: string;
    type?: string;
    code?: string;
  };
}

/**
 * Vercel AI Gateway provider implementation.
 */
export class VercelGatewayProvider implements AIProvider {
  name = "vercel-gateway";
  private baseUrl = "https://ai-gateway.vercel.sh/v1";
  private apiKey: string;
  private timeout = 2 * 60000; // 2 minutes

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("Vercel AI Gateway API key is required");
    }
    this.apiKey = apiKey;
  }

  /**
   * Make a request to the gateway with timeout and better error handling
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number = this.timeout,
  ): Promise<Response> {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal =
      options.signal && timeoutSignal
        ? AbortSignal.any([options.signal, timeoutSignal])
        : (options.signal ?? timeoutSignal);

    try {
      const response = await fetch(url, {
        ...options,
        signal,
      });

      // Parse and propagate OpenAI-formatted errors
      if (!response.ok) {
        let errorData: GatewayError | null = null;

        try {
          const text = await response.text();
          errorData = JSON.parse(text);
        } catch {
          // If parsing fails, we'll use a generic error below
        }

        if (errorData?.error) {
          // Propagate the structured error from gateway
          throw {
            status: response.status,
            error: errorData.error,
          };
        }

        // Fallback for non-JSON errors
        throw {
          status: response.status,
          error: {
            message: `Gateway request failed with status ${response.status}`,
            type: "gateway_error",
            code: "gateway_request_failed",
          },
        };
      }

      return response;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        if (timeoutSignal.aborted) {
          throw {
            status: 504,
            error: {
              message: `Gateway request timeout after ${Math.floor(timeoutMs / 1000)} seconds`,
              type: "timeout_error",
              code: "gateway_timeout",
            },
          };
        }

        if (options.signal?.aborted) {
          throw {
            status: 499,
            error: {
              message: "Gateway request aborted",
              type: "abort_error",
              code: "request_aborted",
            },
          };
        }

        throw {
          status: 504,
          error: {
            message: `Gateway request timeout after ${Math.floor(timeoutMs / 1000)} seconds`,
            type: "timeout_error",
            code: "gateway_timeout",
          },
        };
      }

      // Re-throw structured errors
      throw error;
    }
  }

  async chatCompletions(
    request: OpenAIChatRequest,
    options?: ProviderRequestOptions,
  ): Promise<Response> {
    logger.debug("[Vercel Gateway] Forwarding chat completion request", {
      model: request.model,
      streaming: request.stream,
      messageCount: request.messages.length,
    });

    return await this.fetchWithTimeout(
      `${this.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
        signal: options?.signal,
      },
      options?.timeoutMs,
    );
  }

  async responses(
    body: unknown,
    options?: ProviderRequestOptions,
  ): Promise<Response> {
    // Forward the raw Responses API body to the Vercel AI Gateway
    // `/responses` passthrough. We do not inspect or transform the body —
    // that is the whole point of this path: gpt-5.x clients (Codex CLI,
    // AI SDK Responses transport) send shapes the Chat Completions API
    // does not accept (flat tools, `type: "custom"` tools, `web_search`,
    // `image_generation`, etc.) and must reach the upstream intact.
    const bodyRecord =
      body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    logger.debug("[Vercel Gateway] Forwarding responses request", {
      model: bodyRecord.model,
      streaming: bodyRecord.stream,
    });

    return await this.fetchWithTimeout(
      `${this.baseUrl}/responses`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: options?.signal,
      },
      options?.timeoutMs,
    );
  }

  async embeddings(request: OpenAIEmbeddingsRequest): Promise<Response> {
    logger.debug("[Vercel Gateway] Forwarding embeddings request", {
      model: request.model,
      inputType: Array.isArray(request.input) ? "array" : "string",
    });

    return await this.fetchWithTimeout(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });
  }

  async listModels(): Promise<Response> {
    return await this.fetchWithTimeout(`${this.baseUrl}/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });
  }

  async getModel(model: string): Promise<Response> {
    return await this.fetchWithTimeout(`${this.baseUrl}/models/${model}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });
  }
}

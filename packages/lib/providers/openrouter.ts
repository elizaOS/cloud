/**
 * OpenRouter provider implementation.
 *
 * Provides OpenAI-compatible API access through OpenRouter.
 * Used as a fallback when Vercel AI Gateway is unavailable (402/429).
 */

import { logger } from "@/lib/utils/logger";
import type {
  AIProvider,
  OpenAIChatRequest,
  OpenAIEmbeddingsRequest,
  ProviderRequestOptions,
} from "./types";

interface OpenRouterError {
  error: {
    message: string;
    type?: string;
    code?: string;
  };
}

export class OpenRouterProvider implements AIProvider {
  name = "openrouter";
  private baseUrl = "https://openrouter.ai/api/v1";
  private apiKey: string;
  private timeout = 2 * 60000; // 2 minutes

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("OpenRouter API key is required");
    }
    this.apiKey = apiKey;
  }

  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://eliza.cloud",
      "X-Title": "Eliza Cloud",
    };
  }

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

      if (!response.ok) {
        let errorData: OpenRouterError | null = null;

        try {
          const text = await response.text();
          errorData = JSON.parse(text);
        } catch {
          // If parsing fails, we'll use a generic error below
        }

        if (errorData?.error) {
          throw {
            status: response.status,
            error: errorData.error,
          };
        }

        throw {
          status: response.status,
          error: {
            message: `OpenRouter request failed with status ${response.status}`,
            type: "openrouter_error",
            code: "openrouter_request_failed",
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
              message: `OpenRouter request timeout after ${Math.floor(timeoutMs / 1000)} seconds`,
              type: "timeout_error",
              code: "openrouter_timeout",
            },
          };
        }

        if (options.signal?.aborted) {
          throw {
            status: 499,
            error: {
              message: "OpenRouter request aborted",
              type: "abort_error",
              code: "request_aborted",
            },
          };
        }

        throw {
          status: 504,
          error: {
            message: `OpenRouter request timeout after ${Math.floor(timeoutMs / 1000)} seconds`,
            type: "timeout_error",
            code: "openrouter_timeout",
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
    const { providerOptions: _providerOptions, ...rest } = request;

    logger.debug("[OpenRouter] Forwarding chat completion request", {
      model: request.model,
      streaming: request.stream,
      messageCount: request.messages.length,
    });

    return await this.fetchWithTimeout(
      `${this.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(rest),
        signal: options?.signal,
      },
      options?.timeoutMs,
    );
  }

  async embeddings(request: OpenAIEmbeddingsRequest): Promise<Response> {
    logger.debug("[OpenRouter] Forwarding embeddings request", {
      model: request.model,
      inputType: Array.isArray(request.input) ? "array" : "string",
    });

    return await this.fetchWithTimeout(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: this.getHeaders(),
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

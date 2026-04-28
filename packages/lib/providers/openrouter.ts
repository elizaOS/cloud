/**
 * OpenRouter provider implementation.
 *
 * Provides OpenAI-compatible API access through OpenRouter.
 * Primary AI provider for all non-Groq traffic.
 */

import { logger } from "@/lib/utils/logger";
import { toOpenRouterModelId } from "./model-id-translation";
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
    const translatedModel = toOpenRouterModelId(rest.model);
    const body =
      translatedModel === rest.model
        ? rest
        : { ...rest, model: translatedModel };

    logger.debug("[OpenRouter] Forwarding chat completion request", {
      model: translatedModel,
      streaming: request.stream,
      messageCount: request.messages.length,
    });

    return await this.fetchWithTimeout(
      `${this.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(body),
        signal: options?.signal,
      },
      options?.timeoutMs,
    );
  }

  async responses(
    body: unknown,
    options?: ProviderRequestOptions,
  ): Promise<Response> {
    const bodyRecord =
      body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const requestedModel =
      typeof bodyRecord.model === "string" ? bodyRecord.model : undefined;
    const translatedModel = requestedModel
      ? toOpenRouterModelId(requestedModel)
      : undefined;
    const upstreamBody =
      translatedModel && translatedModel !== requestedModel
        ? { ...bodyRecord, model: translatedModel }
        : body;

    logger.debug("[OpenRouter] Forwarding responses request", {
      model: translatedModel ?? bodyRecord.model,
      streaming: bodyRecord.stream,
    });

    return await this.fetchWithTimeout(
      `${this.baseUrl}/responses`,
      {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(upstreamBody),
        signal: options?.signal,
      },
      options?.timeoutMs,
    );
  }

  async embeddings(request: OpenAIEmbeddingsRequest): Promise<Response> {
    const translatedModel = toOpenRouterModelId(request.model);
    const body =
      translatedModel === request.model
        ? request
        : { ...request, model: translatedModel };

    logger.debug("[OpenRouter] Forwarding embeddings request", {
      model: translatedModel,
      inputType: Array.isArray(request.input) ? "array" : "string",
    });

    return await this.fetchWithTimeout(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(body),
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
    const translatedModel = toOpenRouterModelId(model);
    return await this.fetchWithTimeout(
      `${this.baseUrl}/models/${translatedModel}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      },
    );
  }
}

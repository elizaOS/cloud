/**
 * OpenAI direct provider.
 *
 * Used as a per-family fallback when OpenRouter is unavailable for an
 * `openai/*` model. Strips the `openai/` prefix before calling the
 * upstream because OpenAI's API expects bare ids (`gpt-5.4-mini`).
 */

import { logger } from "@/lib/utils/logger";
import type {
  AIProvider,
  OpenAIChatRequest,
  OpenAIEmbeddingsRequest,
  ProviderRequestOptions,
} from "./types";

interface OpenAIError {
  error: {
    message: string;
    type?: string;
    code?: string;
  };
}

function stripOpenAIPrefix(model: string): string {
  return model.startsWith("openai/") ? model.slice("openai/".length) : model;
}

export class OpenAIDirectProvider implements AIProvider {
  name = "openai";
  private baseUrl = "https://api.openai.com/v1";
  private apiKey: string;
  private timeout = 2 * 60000;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("OpenAI API key is required");
    }
    this.apiKey = apiKey;
  }

  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
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
      const response = await fetch(url, { ...options, signal });

      if (!response.ok) {
        let errorData: OpenAIError | null = null;
        try {
          errorData = JSON.parse(await response.text());
        } catch {
          // fall through to generic error below
        }

        if (errorData?.error) {
          throw { status: response.status, error: errorData.error };
        }

        throw {
          status: response.status,
          error: {
            message: `OpenAI request failed with status ${response.status}`,
            type: "openai_error",
            code: "openai_request_failed",
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
              message: `OpenAI request timeout after ${Math.floor(timeoutMs / 1000)} seconds`,
              type: "timeout_error",
              code: "openai_timeout",
            },
          };
        }
        if (options.signal?.aborted) {
          throw {
            status: 499,
            error: {
              message: "OpenAI request aborted",
              type: "abort_error",
              code: "request_aborted",
            },
          };
        }
        throw {
          status: 504,
          error: {
            message: `OpenAI request timeout after ${Math.floor(timeoutMs / 1000)} seconds`,
            type: "timeout_error",
            code: "openai_timeout",
          },
        };
      }
      throw error;
    }
  }

  async chatCompletions(
    request: OpenAIChatRequest,
    options?: ProviderRequestOptions,
  ): Promise<Response> {
    const { providerOptions: _providerOptions, ...rest } = request;
    const body = { ...rest, model: stripOpenAIPrefix(rest.model) };

    logger.debug("[OpenAI Direct] Forwarding chat completion request", {
      model: body.model,
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
    const upstreamBody = requestedModel
      ? { ...bodyRecord, model: stripOpenAIPrefix(requestedModel) }
      : body;

    logger.debug("[OpenAI Direct] Forwarding responses request", {
      model: requestedModel,
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
    const body = { ...request, model: stripOpenAIPrefix(request.model) };

    logger.debug("[OpenAI Direct] Forwarding embeddings request", {
      model: body.model,
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
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
  }

  async getModel(model: string): Promise<Response> {
    return await this.fetchWithTimeout(
      `${this.baseUrl}/models/${stripOpenAIPrefix(model)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${this.apiKey}` },
      },
    );
  }
}

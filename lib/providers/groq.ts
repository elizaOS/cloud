import { getGroqApiModelId, GROQ_NATIVE_MODELS } from "@/lib/models";
import { logger } from "@/lib/utils/logger";
import type {
  AIProvider,
  OpenAIChatRequest,
  OpenAIEmbeddingsRequest,
} from "./types";

interface GroqError {
  error: {
    message: string;
    type?: string;
    code?: string;
  };
}

export class GroqProvider implements AIProvider {
  name = "groq";
  private baseUrl = "https://api.groq.com/openai/v1";
  private apiKey: string;
  private timeout = 2 * 60000;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("Groq API key is required");
    }
    this.apiKey = apiKey;
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorData: GroqError | null = null;

        try {
          const text = await response.text();
          errorData = JSON.parse(text);
        } catch {
          // Fall through to the generic error below.
        }

        throw {
          status: response.status,
          error: errorData?.error || {
            message: `Groq request failed with status ${response.status}`,
            type: "groq_error",
            code: "groq_request_failed",
          },
        };
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        throw {
          status: 504,
          error: {
            message: "Groq request timeout after 60 seconds",
            type: "timeout_error",
            code: "groq_timeout",
          },
        };
      }

      throw error;
    }
  }

  async chatCompletions(request: OpenAIChatRequest): Promise<Response> {
    const { providerOptions: _providerOptions, ...rest } = request;
    const groqRequest: OpenAIChatRequest = {
      ...rest,
      model: getGroqApiModelId(request.model),
    };

    logger.debug("[Groq] Forwarding chat completion request", {
      model: request.model,
      resolvedModel: groqRequest.model,
      streaming: request.stream,
      messageCount: request.messages.length,
    });

    return this.fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(groqRequest),
    });
  }

  async embeddings(_request: OpenAIEmbeddingsRequest): Promise<Response> {
    return Response.json(
      {
        error: {
          message: "Groq embeddings are not supported by this provider adapter",
          type: "invalid_request_error",
          code: "unsupported_operation",
        },
      },
      { status: 400 },
    );
  }

  async listModels(): Promise<Response> {
    return Response.json({
      object: "list",
      data: GROQ_NATIVE_MODELS,
    });
  }

  async getModel(model: string): Promise<Response> {
    const groqModel = GROQ_NATIVE_MODELS.find((entry) => entry.id === model);

    if (!groqModel) {
      return Response.json(
        {
          error: {
            message: `Groq model '${model}' not found`,
            type: "invalid_request_error",
            code: "model_not_found",
          },
        },
        { status: 404 },
      );
    }

    return Response.json(groqModel);
  }
}

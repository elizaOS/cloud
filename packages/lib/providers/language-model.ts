import { gateway } from "@ai-sdk/gateway";
import { createOpenAI } from "@ai-sdk/openai";
import { getGroqApiModelId, isGroqNativeModel } from "@/lib/models";

let groqClient: ReturnType<typeof createOpenAI> | null = null;
let openAIClient: ReturnType<typeof createOpenAI> | null = null;

function getGatewayApiKey(): string | null {
  return process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_AI_GATEWAY_API_KEY || null;
}

function getGroqClient() {
  if (!groqClient) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error("GROQ_API_KEY environment variable is required");
    }

    groqClient = createOpenAI({
      apiKey,
      baseURL: "https://api.groq.com/openai/v1",
    });
  }

  return groqClient;
}

function getOpenAIClient() {
  if (!openAIClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }

    openAIClient = createOpenAI({ apiKey });
  }

  return openAIClient;
}

function isOpenAINativeModel(model: string): boolean {
  return (
    model.startsWith("openai/") ||
    model.startsWith("gpt-") ||
    model.startsWith("o1") ||
    model.startsWith("o3") ||
    model.startsWith("o4") ||
    model.startsWith("text-embedding-")
  );
}

function normalizeOpenAIModelId(model: string): string {
  return model.startsWith("openai/") ? model.slice("openai/".length) : model;
}

export function hasLanguageModelProviderConfigured(model: string): boolean {
  if (isGroqNativeModel(model)) {
    return Boolean(process.env.GROQ_API_KEY);
  }

  return Boolean(getGatewayApiKey() || process.env.OPENAI_API_KEY);
}

export function hasTextEmbeddingProviderConfigured(): boolean {
  return Boolean(getGatewayApiKey() || process.env.OPENAI_API_KEY);
}

export function getLanguageModel(model: string) {
  if (isGroqNativeModel(model)) {
    return getGroqClient().languageModel(getGroqApiModelId(model));
  }

  if (isOpenAINativeModel(model) && process.env.OPENAI_API_KEY) {
    return getOpenAIClient().languageModel(normalizeOpenAIModelId(model));
  }

  if (getGatewayApiKey()) {
    return gateway.languageModel(model);
  }

  if (process.env.OPENAI_API_KEY) {
    return getOpenAIClient().languageModel(normalizeOpenAIModelId(model));
  }

  throw new Error("AI language model provider is not configured");
}

export function getTextEmbeddingModel(model: string) {
  if (isOpenAINativeModel(model) && process.env.OPENAI_API_KEY) {
    return getOpenAIClient().textEmbeddingModel(normalizeOpenAIModelId(model));
  }

  if (getGatewayApiKey()) {
    return gateway.textEmbeddingModel(model);
  }

  if (process.env.OPENAI_API_KEY) {
    return getOpenAIClient().textEmbeddingModel(normalizeOpenAIModelId(model));
  }

  throw new Error("AI text embedding provider is not configured");
}

export function getAiProviderConfigurationError(): string {
  return "AI services are not configured on this deployment";
}

export function hasGatewayProviderConfigured(): boolean {
  return Boolean(getGatewayApiKey());
}

export function hasOpenAIProviderConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function hasGroqLanguageModelProviderConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

export function resolveAiProviderSource(model: string): "groq" | "gateway" | "openai" | null {
  if (isGroqNativeModel(model)) {
    return process.env.GROQ_API_KEY ? "groq" : null;
  }

  if (getGatewayApiKey()) {
    return "gateway";
  }

  if (process.env.OPENAI_API_KEY) {
    return "openai";
  }

  return null;
}

export function resolveEmbeddingProviderSource(): "gateway" | "openai" | null {
  if (getGatewayApiKey()) {
    return "gateway";
  }

  if (process.env.OPENAI_API_KEY) {
    return "openai";
  }

  return null;
}

export function hasAnyAiProviderConfigured(): boolean {
  return Boolean(getGatewayApiKey() || process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY);
}

export function getAiProviderConfigurationStatus() {
  return {
    gateway: Boolean(getGatewayApiKey()),
    openai: Boolean(process.env.OPENAI_API_KEY),
    groq: Boolean(process.env.GROQ_API_KEY),
  };
}

export function getAiProviderConfigurationSummary(): string {
  const status = getAiProviderConfigurationStatus();
  const configured = Object.entries(status)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name);

  return configured.length > 0 ? configured.join(", ") : "none";
}

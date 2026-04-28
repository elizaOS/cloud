import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { getGroqApiModelId, isGroqNativeModel } from "@/lib/models";
import { toOpenRouterModelId } from "./model-id-translation";

let groqClient: ReturnType<typeof createOpenAI> | null = null;
let openAIClient: ReturnType<typeof createOpenAI> | null = null;
let openRouterClient: ReturnType<typeof createOpenAI> | null = null;
let anthropicClient: ReturnType<typeof createAnthropic> | null = null;

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

function getOpenRouterApiKey(): string | null {
  return process.env.OPENROUTER_API_KEY || null;
}

function getOpenRouterClient() {
  if (!openRouterClient) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY environment variable is required");
    }

    openRouterClient = createOpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
    });
  }

  return openRouterClient;
}

function getAnthropicClient() {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required");
    }

    anthropicClient = createAnthropic({ apiKey });
  }

  return anthropicClient;
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

function isAnthropicNativeModel(model: string): boolean {
  return model.startsWith("anthropic/") || model.startsWith("claude-");
}

function normalizeOpenAIModelId(model: string): string {
  return model.startsWith("openai/") ? model.slice("openai/".length) : model;
}

function normalizeAnthropicModelId(model: string): string {
  return model.startsWith("anthropic/")
    ? model.slice("anthropic/".length)
    : model;
}

export function hasLanguageModelProviderConfigured(model: string): boolean {
  if (isGroqNativeModel(model)) {
    return Boolean(process.env.GROQ_API_KEY);
  }

  return Boolean(
    getOpenRouterApiKey() ||
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY,
  );
}

export function hasTextEmbeddingProviderConfigured(): boolean {
  return Boolean(getOpenRouterApiKey() || process.env.OPENAI_API_KEY);
}

export function getLanguageModel(model: string) {
  if (isGroqNativeModel(model)) {
    return getGroqClient().languageModel(getGroqApiModelId(model));
  }

  if (getOpenRouterApiKey()) {
    return getOpenRouterClient().languageModel(toOpenRouterModelId(model));
  }

  if (isOpenAINativeModel(model) && process.env.OPENAI_API_KEY) {
    return getOpenAIClient().languageModel(normalizeOpenAIModelId(model));
  }

  if (isAnthropicNativeModel(model) && process.env.ANTHROPIC_API_KEY) {
    return getAnthropicClient().languageModel(normalizeAnthropicModelId(model));
  }

  throw new Error("AI language model provider is not configured");
}

export function getTextEmbeddingModel(model: string) {
  if (getOpenRouterApiKey()) {
    return getOpenRouterClient().textEmbeddingModel(toOpenRouterModelId(model));
  }

  if (isOpenAINativeModel(model) && process.env.OPENAI_API_KEY) {
    return getOpenAIClient().textEmbeddingModel(normalizeOpenAIModelId(model));
  }

  throw new Error("AI text embedding provider is not configured");
}

export function getAiProviderConfigurationError(): string {
  return "AI services are not configured on this deployment";
}

export function hasOpenAIProviderConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function hasAnthropicProviderConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function hasGroqLanguageModelProviderConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

export function resolveAiProviderSource(
  model: string,
): "groq" | "openrouter" | "openai" | "anthropic" | null {
  if (isGroqNativeModel(model)) {
    return process.env.GROQ_API_KEY ? "groq" : null;
  }

  if (getOpenRouterApiKey()) {
    return "openrouter";
  }

  if (isOpenAINativeModel(model) && process.env.OPENAI_API_KEY) {
    return "openai";
  }

  if (isAnthropicNativeModel(model) && process.env.ANTHROPIC_API_KEY) {
    return "anthropic";
  }

  return null;
}

export function resolveEmbeddingProviderSource():
  | "openrouter"
  | "openai"
  | null {
  if (getOpenRouterApiKey()) {
    return "openrouter";
  }

  if (process.env.OPENAI_API_KEY) {
    return "openai";
  }

  return null;
}

export function hasAnyAiProviderConfigured(): boolean {
  return Boolean(
    getOpenRouterApiKey() ||
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.GROQ_API_KEY,
  );
}

export function getAiProviderConfigurationStatus() {
  return {
    openrouter: Boolean(getOpenRouterApiKey()),
    openai: Boolean(process.env.OPENAI_API_KEY),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
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

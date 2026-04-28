/**
 * AI provider implementations and singleton access.
 *
 * OpenRouter is the principal non-Groq provider. Per-family direct
 * providers (OpenAI, Anthropic) are wired as failover targets via
 * `getProviderForModelWithFallback` when their respective API keys
 * are configured.
 */

import { isGroqNativeModel } from "@/lib/models";
import { AnthropicDirectProvider } from "./anthropic-direct";
import { GroqProvider } from "./groq";
import { OpenAIDirectProvider } from "./openai-direct";
import { OpenRouterProvider } from "./openrouter";
import type { AIProvider } from "./types";

export { AnthropicDirectProvider } from "./anthropic-direct";
// Note: anthropic-thinking parse helpers (parseAnthropicCotBudgetFromEnv, etc.) are exported
// as public API. Whitespace-only env values (e.g. "   ") will throw at startup rather than
// silently disable thinking - this is intentional fail-fast behavior.
export * from "./anthropic-thinking";
export { withProviderFallback } from "./failover";
export { GroqProvider } from "./groq";
export { OpenAIDirectProvider } from "./openai-direct";
export { OpenRouterProvider } from "./openrouter";
export * from "./types";

let openRouterProviderInstance: AIProvider | null = null;
let groqProviderInstance: AIProvider | null = null;
let openAIDirectProviderInstance: AIProvider | null = null;
let anthropicDirectProviderInstance: AIProvider | null = null;

/**
 * Gets the principal AI provider instance (OpenRouter).
 *
 * Lazy initialized on first call.
 *
 * @returns OpenRouter provider instance.
 * @throws Error if OPENROUTER_API_KEY is not configured.
 */
export function getProvider(): AIProvider {
  if (!openRouterProviderInstance) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY environment variable is required");
    }
    openRouterProviderInstance = new OpenRouterProvider(apiKey);
  }
  return openRouterProviderInstance;
}

export function hasGroqProviderConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

export function getGroqProvider(): AIProvider {
  if (!groqProviderInstance) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error("GROQ_API_KEY environment variable is required");
    }
    groqProviderInstance = new GroqProvider(apiKey);
  }

  return groqProviderInstance;
}

export function hasOpenRouterProviderConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export function getOpenRouterProvider(): AIProvider {
  return getProvider();
}

function hasOpenAIDirectConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function getOpenAIDirectProvider(): AIProvider {
  if (!openAIDirectProviderInstance) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }
    openAIDirectProviderInstance = new OpenAIDirectProvider(apiKey);
  }
  return openAIDirectProviderInstance;
}

function hasAnthropicDirectConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function getAnthropicDirectProvider(): AIProvider {
  if (!anthropicDirectProviderInstance) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required");
    }
    anthropicDirectProviderInstance = new AnthropicDirectProvider(apiKey);
  }
  return anthropicDirectProviderInstance;
}

export function getProviderForModel(model: string): AIProvider {
  if (isGroqNativeModel(model)) {
    return getGroqProvider();
  }

  return getProvider();
}

/**
 * Returns primary + fallback providers for a model.
 *
 * Routes used by chat/completions, responses, embeddings, and apps/[id]/chat
 * call this to enable automatic 402/429 failover via `withProviderFallback`.
 *
 * Fallback rules:
 *   - Groq native models: no fallback (Groq runs through its own provider).
 *   - `openai/*`: OpenAI direct fallback when OPENAI_API_KEY is set.
 *   - `anthropic/*`: Anthropic direct fallback when ANTHROPIC_API_KEY is set.
 *   - All other models (xai, google, mistral, …): no fallback.
 */
export function getProviderForModelWithFallback(model: string): {
  primary: AIProvider;
  fallback: AIProvider | null;
} {
  if (isGroqNativeModel(model)) {
    return { primary: getGroqProvider(), fallback: null };
  }

  const primary = getProvider();

  if (model.startsWith("openai/") && hasOpenAIDirectConfigured()) {
    return { primary, fallback: getOpenAIDirectProvider() };
  }

  if (model.startsWith("anthropic/") && hasAnthropicDirectConfigured()) {
    return { primary, fallback: getAnthropicDirectProvider() };
  }

  return { primary, fallback: null };
}

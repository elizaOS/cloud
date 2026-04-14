/**
 * AI provider implementations and singleton access.
 */

import { isGroqNativeModel } from "@/lib/models";
import { GroqProvider } from "./groq";
import { OpenRouterProvider } from "./openrouter";
import type { AIProvider } from "./types";
import { VercelGatewayProvider } from "./vercel-gateway";

// Note: anthropic-thinking parse helpers (parseAnthropicCotBudgetFromEnv, etc.) are exported
// as public API. Whitespace-only env values (e.g. "   ") will throw at startup rather than
// silently disable thinking - this is intentional fail-fast behavior.
export * from "./anthropic-thinking";
export { withProviderFallback } from "./failover";
export { GroqProvider } from "./groq";
export { OpenRouterProvider } from "./openrouter";
export * from "./types";
export { VercelGatewayProvider } from "./vercel-gateway";

// Singleton provider instances (lazy initialized)
let providerInstance: AIProvider | null = null;
let groqProviderInstance: AIProvider | null = null;
let openRouterProviderInstance: AIProvider | null = null;

/**
 * Gets the AI provider instance.
 *
 * Uses Vercel AI Gateway by default. Lazy initializes on first call.
 *
 * @returns AI provider instance.
 * @throws Error if AI_GATEWAY_API_KEY is not configured.
 */
export function getProvider(): AIProvider {
  if (!providerInstance) {
    const apiKey = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_AI_GATEWAY_API_KEY;
    if (!apiKey) {
      throw new Error(
        "AI_GATEWAY_API_KEY or VERCEL_AI_GATEWAY_API_KEY environment variable is required",
      );
    }
    providerInstance = new VercelGatewayProvider(apiKey);
  }
  return providerInstance;
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
  if (!openRouterProviderInstance) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY environment variable is required");
    }
    openRouterProviderInstance = new OpenRouterProvider(apiKey);
  }

  return openRouterProviderInstance;
}

function hasGatewayConfigured(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_AI_GATEWAY_API_KEY);
}

export function getProviderForModel(model: string): AIProvider {
  if (isGroqNativeModel(model)) {
    return getGroqProvider();
  }

  if (hasGatewayConfigured()) {
    return getProvider();
  }

  if (hasOpenRouterProviderConfigured()) {
    return getOpenRouterProvider();
  }

  return getProvider(); // will throw with missing API key error
}

/**
 * Returns primary + fallback providers for a model.
 * Used by routes that want automatic 402/429 failover via `withProviderFallback`.
 */
export function getProviderForModelWithFallback(model: string): {
  primary: AIProvider;
  fallback: AIProvider | null;
} {
  if (isGroqNativeModel(model)) {
    return { primary: getGroqProvider(), fallback: null };
  }

  const hasGateway = hasGatewayConfigured();
  const hasOpenRouter = hasOpenRouterProviderConfigured();

  if (hasGateway && hasOpenRouter) {
    return { primary: getProvider(), fallback: getOpenRouterProvider() };
  }
  if (hasGateway) {
    return { primary: getProvider(), fallback: null };
  }
  if (hasOpenRouter) {
    return { primary: getOpenRouterProvider(), fallback: null };
  }

  return { primary: getProvider(), fallback: null }; // will throw with missing API key error
}

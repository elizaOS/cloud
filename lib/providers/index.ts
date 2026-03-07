/**
 * AI provider implementations and singleton access.
 */

import { isGroqNativeModel } from "@/lib/models";
import { GroqProvider } from "./groq";
import { VercelGatewayProvider } from "./vercel-gateway";
import type { AIProvider } from "./types";

export * from "./types";
export { GroqProvider } from "./groq";
export { VercelGatewayProvider } from "./vercel-gateway";

// Singleton provider instance (lazy initialized)
let providerInstance: AIProvider | null = null;
let groqProviderInstance: AIProvider | null = null;

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
    const apiKey = process.env.AI_GATEWAY_API_KEY;
    if (!apiKey) {
      throw new Error(
        "VERCEL_AI_GATEWAY_API_KEY environment variable is required",
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

export function getProviderForModel(model: string): AIProvider {
  if (isGroqNativeModel(model)) {
    return getGroqProvider();
  }

  return getProvider();
}

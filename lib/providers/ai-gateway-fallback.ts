/**
 * AI Gateway Fallback Provider
 *
 * Provides resilient AI model access with automatic fallback:
 * 1. Primary: Vercel AI Gateway (OIDC-based, optimal routing)
 * 2. Fallback: Direct provider APIs (OpenAI, Anthropic) when OIDC fails
 *
 * This addresses production OIDC token issues by gracefully degrading
 * to direct API access without breaking user-facing functionality.
 */

import { gateway } from "@ai-sdk/gateway";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import type { LanguageModel, EmbeddingModel } from "ai";
import { logger } from "@/lib/utils/logger";
import {
    withRetry,
    classifyError,
    isCircuitOpen,
    CircuitBreakerOpenError,
} from "@/lib/utils/retry";

/**
 * Provider detection from model name
 */
type ProviderType = "openai" | "anthropic" | "groq" | "unknown";

function detectProvider(model: string): ProviderType {
    const lowerModel = model.toLowerCase();
    if (
        lowerModel.startsWith("openai/") ||
        lowerModel.includes("gpt-") ||
        lowerModel.includes("o1-") ||
        lowerModel.includes("o3-")
    ) {
        return "openai";
    }
    if (lowerModel.startsWith("anthropic/") || lowerModel.includes("claude")) {
        return "anthropic";
    }
    if (lowerModel.startsWith("groq/") || lowerModel.includes("llama")) {
        return "groq";
    }
    return "unknown";
}

/**
 * Extracts model name without provider prefix
 */
function stripProviderPrefix(model: string): string {
    const prefixes = ["openai/", "anthropic/", "groq/"];
    for (const prefix of prefixes) {
        if (model.toLowerCase().startsWith(prefix)) {
            return model.slice(prefix.length);
        }
    }
    return model;
}

/**
 * Checks if OIDC is likely available
 */
function isOIDCAvailable(): boolean {
    // In Vercel deployments, OIDC token is auto-injected
    // Check if we're in a Vercel environment
    const isVercel = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
    const hasOIDCToken = Boolean(process.env.VERCEL_OIDC_TOKEN);

    // If circuit breaker is open for gateway, don't try OIDC
    if (isCircuitOpen("ai-gateway")) {
        logger.debug("[AIGatewayFallback] Circuit breaker open, skipping OIDC");
        return false;
    }

    return isVercel || hasOIDCToken;
}

/**
 * Checks if fallback providers are available
 */
function hasFallbackProviders(): boolean {
    return Boolean(
        process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY,
    );
}

/**
 * Gets a fallback language model for direct API access
 */
function getFallbackLanguageModel(model: string): LanguageModel | null {
    const provider = detectProvider(model);
    const strippedModel = stripProviderPrefix(model);

    switch (provider) {
        case "openai":
            if (process.env.OPENAI_API_KEY) {
                logger.info("[AIGatewayFallback] Using OpenAI direct fallback", {
                    model: strippedModel,
                });
                return openai(strippedModel);
            }
            break;
        case "anthropic":
            if (process.env.ANTHROPIC_API_KEY) {
                logger.info("[AIGatewayFallback] Using Anthropic direct fallback", {
                    model: strippedModel,
                });
                return anthropic(strippedModel);
            }
            break;
        case "groq":
            // Groq models can often be served through OpenAI-compatible API
            // or we fall back to OpenAI equivalent
            if (process.env.OPENAI_API_KEY) {
                const openaiEquivalent = "gpt-4o-mini"; // Reasonable fallback
                logger.info("[AIGatewayFallback] Groq unavailable, falling back to OpenAI", {
                    originalModel: model,
                    fallbackModel: openaiEquivalent,
                });
                return openai(openaiEquivalent);
            }
            break;
    }

    return null;
}

/**
 * Gets a fallback embedding model for direct API access
 */
function getFallbackEmbeddingModel(
    model: string,
): EmbeddingModel | null {
    const strippedModel = stripProviderPrefix(model);

    // Most embedding models are OpenAI-compatible
    if (process.env.OPENAI_API_KEY) {
        // Map common embedding models to OpenAI equivalents
        const embeddingModel = strippedModel.includes("embedding")
            ? strippedModel
            : "text-embedding-3-small";

        logger.info("[AIGatewayFallback] Using OpenAI embedding fallback", {
            model: embeddingModel,
        });
        return openai.embedding(embeddingModel);
    }

    return null;
}

/**
 * Service name for circuit breaker
 */
const GATEWAY_SERVICE = "ai-gateway";
const FALLBACK_SERVICE = "ai-fallback";

/**
 * Gets a language model with automatic fallback
 *
 * Attempts to use Vercel AI Gateway first, falls back to direct API if:
 * - OIDC token is unavailable/expired
 * - Gateway returns authentication errors
 * - Circuit breaker is open
 *
 * @param model - Model identifier (e.g., "openai/gpt-4o", "anthropic/claude-3-sonnet")
 * @returns Language model instance
 * @throws Error if no provider is available
 */
export async function getLanguageModelWithFallback(
    model: string,
): Promise<LanguageModel> {
    // Try gateway first if OIDC appears available
    if (isOIDCAvailable()) {
        try {
            // Validate gateway access with retry
            const gatewayModel = await withRetry(
                async () => {
                    const m = gateway.languageModel(model);
                    // The model object is created lazily, so we need to trigger
                    // any auth validation. Unfortunately, there's no lightweight
                    // validation call, so we just return the model and let
                    // actual calls handle auth errors.
                    return m;
                },
                GATEWAY_SERVICE,
                { maxRetries: 1 }, // Quick fail for model creation
            );

            logger.debug("[AIGatewayFallback] Using AI Gateway", { model });
            return gatewayModel;
        } catch (error) {
            const classified = classifyError(error);

            if (classified.isOIDCError || error instanceof CircuitBreakerOpenError) {
                logger.warn("[AIGatewayFallback] Gateway unavailable, trying fallback", {
                    error: error instanceof Error ? error.message : String(error),
                    isOIDCError: classified.isOIDCError,
                });
            } else {
                // Non-OIDC errors might be model-specific, still try fallback
                logger.warn("[AIGatewayFallback] Gateway error, trying fallback", {
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
    }

    // Try fallback provider
    const fallbackModel = getFallbackLanguageModel(model);
    if (fallbackModel) {
        return fallbackModel;
    }

    // No fallback available
    throw new Error(
        `No AI provider available for model ${model}. ` +
        `Gateway OIDC unavailable and no fallback API key configured. ` +
        `Please set OPENAI_API_KEY or ANTHROPIC_API_KEY as backup.`,
    );
}

/**
 * Gets an embedding model with automatic fallback
 *
 * @param model - Embedding model identifier
 * @returns Embedding model instance
 * @throws Error if no provider is available
 */
export async function getEmbeddingModelWithFallback(
    model: string,
): Promise<EmbeddingModel> {
    // Try gateway first if OIDC appears available
    if (isOIDCAvailable()) {
        try {
            const gatewayModel = await withRetry(
                async () => gateway.textEmbeddingModel(model),
                GATEWAY_SERVICE,
                { maxRetries: 1 },
            );

            logger.debug("[AIGatewayFallback] Using AI Gateway for embeddings", {
                model,
            });
            return gatewayModel;
        } catch (error) {
            const classified = classifyError(error);

            logger.warn("[AIGatewayFallback] Gateway embeddings unavailable", {
                error: error instanceof Error ? error.message : String(error),
                isOIDCError: classified.isOIDCError,
            });
        }
    }

    // Try fallback provider
    const fallbackModel = getFallbackEmbeddingModel(model);
    if (fallbackModel) {
        return fallbackModel;
    }

    throw new Error(
        `No embedding provider available for model ${model}. ` +
        `Gateway OIDC unavailable and no fallback API key configured. ` +
        `Please set OPENAI_API_KEY as backup.`,
    );
}

/**
 * Wraps an AI SDK call with automatic retry and fallback
 *
 * Use this for actual model invocations (not just model creation).
 * Handles OIDC errors that occur during the actual API call.
 *
 * @param primaryFn - Function using gateway model
 * @param fallbackFn - Function using direct API model
 * @param model - Model name for logging
 * @returns Result of the successful call
 */
export async function withGatewayFallback<T>(
    primaryFn: () => Promise<T>,
    fallbackFn: () => Promise<T>,
    model: string,
): Promise<T> {
    // Skip gateway if circuit is open
    if (!isCircuitOpen(GATEWAY_SERVICE)) {
        try {
            return await withRetry(primaryFn, GATEWAY_SERVICE, {
                maxRetries: 2,
                baseDelayMs: 100,
            });
        } catch (error) {
            const classified = classifyError(error);

            if (classified.isOIDCError || classified.isServiceUnavailable) {
                logger.warn("[AIGatewayFallback] Primary call failed, using fallback", {
                    model,
                    error: error instanceof Error ? error.message : String(error),
                });
            } else if (!(error instanceof CircuitBreakerOpenError)) {
                // Re-throw non-recoverable errors
                throw error;
            }
        }
    }

    // Try fallback
    if (hasFallbackProviders()) {
        return await withRetry(fallbackFn, FALLBACK_SERVICE, {
            maxRetries: 2,
            baseDelayMs: 200,
        });
    }

    throw new Error(
        `AI Gateway unavailable for ${model} and no fallback configured. ` +
        `Please check OIDC configuration or set backup API keys.`,
    );
}

/**
 * Status check for AI Gateway health
 */
export interface GatewayHealthStatus {
    gatewayAvailable: boolean;
    oidcAvailable: boolean;
    fallbackAvailable: boolean;
    circuitBreakerOpen: boolean;
    availableProviders: ProviderType[];
}

/**
 * Gets the current health status of AI providers
 */
export function getGatewayHealth(): GatewayHealthStatus {
    const availableProviders: ProviderType[] = [];

    if (process.env.OPENAI_API_KEY) availableProviders.push("openai");
    if (process.env.ANTHROPIC_API_KEY) availableProviders.push("anthropic");

    return {
        gatewayAvailable: Boolean(process.env.AI_GATEWAY_API_KEY),
        oidcAvailable: isOIDCAvailable(),
        fallbackAvailable: hasFallbackProviders(),
        circuitBreakerOpen: isCircuitOpen(GATEWAY_SERVICE),
        availableProviders,
    };
}

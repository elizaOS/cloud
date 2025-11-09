/**
 * Request-scoped context for multi-tenant agent runtime
 * Uses AsyncLocalStorage to provide per-request isolation
 */

import { AsyncLocalStorage } from "node:async_hooks";

interface RequestContext {
  userId?: string;
  apiKey?: string;
  modelPreferences?: {
    smallModel?: string;
    largeModel?: string;
  };
}

// Create async local storage for request context
const requestContext = new AsyncLocalStorage<RequestContext>();

/**
 * Get the current request context
 * Returns undefined if not in a request context
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContext.getStore();
}

/**
 * Run a function with a specific request context
 * Provides isolation between concurrent requests
 */
export async function runWithContext<T>(
  context: RequestContext,
  fn: () => Promise<T>,
): Promise<T> {
  return requestContext.run(context, fn);
}

/**
 * Get ElizaCloud API key from request context or environment
 * This allows per-request API key injection without race conditions
 */
export function getElizaCloudApiKeyFromContext(): string | undefined {
  const context = getRequestContext();
  const key = context?.apiKey || process.env.ELIZAOS_CLOUD_API_KEY;
  
  console.log("[RequestContext] ==================== API KEY DEBUG ====================");
  if (context?.apiKey) {
    console.log("[RequestContext] ✅ Using API key from context (FULL KEY):", context.apiKey);
    console.log("[RequestContext] API key length:", context.apiKey.length);
  } else if (process.env.ELIZAOS_CLOUD_API_KEY) {
    console.log("[RequestContext] Using API key from env (FULL KEY):", process.env.ELIZAOS_CLOUD_API_KEY);
    console.log("[RequestContext] API key length:", process.env.ELIZAOS_CLOUD_API_KEY.length);
  } else {
    console.log("[RequestContext] ❌ No API key available!");
  }
  console.log("[RequestContext] ==========================================================");
  
  return key;
}

/**
 * Get model preference from request context or environment
 */
export function getModelFromContext(
  type: "small" | "large",
): string | undefined {
  const context = getRequestContext();
  
  if (type === "small") {
    return (
      context?.modelPreferences?.smallModel ||
      process.env.ELIZAOS_CLOUD_SMALL_MODEL
    );
  } else {
    return (
      context?.modelPreferences?.largeModel ||
      process.env.ELIZAOS_CLOUD_LARGE_MODEL
    );
  }
}

/**
 * Provider failover utility.
 *
 * Catches retryable errors (402 Payment Required, 429 Rate Limited) from
 * the primary provider and retries the request with a fallback provider.
 */

import { logger } from "@/lib/utils/logger";

/**
 * Whether a provider error is retryable via fallback.
 * Matches the structured `{ status, error }` shape thrown by
 * VercelGatewayProvider and GroqProvider.
 */
function isRetryableProviderError(error: unknown): boolean {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status: number }).status;
    return status === 402 || status === 429;
  }
  return false;
}

/**
 * Execute `primaryFn`. On a retryable provider error (402/429),
 * log a warning and execute `fallbackFn` instead.
 */
export async function withProviderFallback(
  primaryFn: () => Promise<Response>,
  fallbackFn: (() => Promise<Response>) | null,
): Promise<Response> {
  try {
    return await primaryFn();
  } catch (error) {
    if (fallbackFn && isRetryableProviderError(error)) {
      const status = (error as { status: number }).status;
      logger.warn("[Provider Failover] Primary provider returned %d, trying fallback", status);
      return await fallbackFn();
    }
    throw error;
  }
}

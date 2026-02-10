import { logger } from "@/lib/utils/logger";

export interface RetryFetchOptions {
  url: string;
  init: RequestInit;
  maxRetries: number;
  initialDelayMs: number;
  timeoutMs: number;
  serviceTag: string;
  nonRetriableStatuses?: number[];
}

/**
 * Shared retry utility with exponential backoff for upstream API calls
 * 
 * WHY this exists:
 * - Solana RPC and Market Data API both need retry logic
 * - DRY: prevents code duplication across service handlers
 * - Consistency: all services use same retry strategy
 * - Maintainability: changing retry logic only requires updating one place
 * 
 * WHY exponential backoff:
 * - Linear retries can overwhelm already-struggling upstream services
 * - Exponential backoff gives upstream time to recover
 * - Standard pattern: 1s -> 2s -> 4s -> 8s -> 16s
 * 
 * WHY API key sanitization:
 * - Many providers (Helius, Birdeye) require API keys in URLs
 * - Logs must never expose API keys for security
 * - Automatic sanitization prevents accidental leaks
 * 
 * WHY non-retriable status codes:
 * - 400 Bad Request: client error, retrying won't help
 * - 404 Not Found: resource doesn't exist, retrying won't help
 * - 5xx errors ARE retriable: server issues may be transient
 */
export async function retryFetch(
  opts: RetryFetchOptions,
  attempt: number = 1,
): Promise<Response> {
  const {
    url,
    init,
    maxRetries,
    initialDelayMs,
    timeoutMs,
    serviceTag,
    nonRetriableStatuses = [400, 404],
  } = opts;

  try {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });

    const sanitizedUrl = url.replace(/api-key=[^&]+/gi, "api-key=***");
    logger.debug(`[${serviceTag}] Attempt`, {
      attempt,
      url: sanitizedUrl,
      status: response.status,
    });

    if (response.ok || nonRetriableStatuses.includes(response.status)) {
      return response;
    }

    if (attempt < maxRetries) {
      const delayMs = initialDelayMs * Math.pow(2, attempt - 1);
      logger.warn(`[${serviceTag}] Retriable error, retrying`, {
        attempt,
        status: response.status,
        delayMs,
      });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return retryFetch(opts, attempt + 1);
    }

    return response;
  } catch (error) {
    const sanitizedUrl = url.replace(/api-key=[^&]+/gi, "api-key=***");

    if (error instanceof Error && error.name === "TimeoutError") {
      logger.warn(`[${serviceTag}] Timeout`, { attempt, url: sanitizedUrl });

      if (attempt < maxRetries) {
        const delayMs = initialDelayMs * Math.pow(2, attempt - 1);
        logger.info(`[${serviceTag}] Retrying after timeout`, {
          attempt,
          delayMs,
        });
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return retryFetch(opts, attempt + 1);
      }
    }

    throw error;
  }
}

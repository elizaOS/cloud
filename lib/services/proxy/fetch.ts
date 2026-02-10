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
 * Generic retry wrapper with exponential backoff for any HTTP request
 * Sanitizes API keys from logs automatically
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

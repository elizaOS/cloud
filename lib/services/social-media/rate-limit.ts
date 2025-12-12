import { logger } from "@/lib/utils/logger";
import type { SocialPlatform } from "@/lib/types/social-media";

export interface RateLimitError extends Error {
  rateLimited: true;
  retryAfter?: number;
  platform: SocialPlatform;
}

export interface ApiResponse<T> {
  data: T;
  rateLimitRemaining?: number;
  rateLimitReset?: Date;
}

interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  platform: SocialPlatform;
}

const PLATFORM_RATE_LIMITS: Record<SocialPlatform, { requestsPerWindow: number; windowMs: number }> = {
  twitter: { requestsPerWindow: 300, windowMs: 15 * 60 * 1000 },
  bluesky: { requestsPerWindow: 3000, windowMs: 5 * 60 * 1000 },
  discord: { requestsPerWindow: 50, windowMs: 1000 },
  telegram: { requestsPerWindow: 30, windowMs: 1000 },
  reddit: { requestsPerWindow: 60, windowMs: 60 * 1000 },
  facebook: { requestsPerWindow: 200, windowMs: 60 * 60 * 1000 },
  instagram: { requestsPerWindow: 200, windowMs: 60 * 60 * 1000 },
  tiktok: { requestsPerWindow: 100, windowMs: 60 * 1000 },
  linkedin: { requestsPerWindow: 100, windowMs: 24 * 60 * 60 * 1000 },
  mastodon: { requestsPerWindow: 300, windowMs: 5 * 60 * 1000 },
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseRetryAfter(response: Response): number | undefined {
  const retryAfter = response.headers.get("retry-after");
  if (!retryAfter) return undefined;

  const seconds = parseInt(retryAfter, 10);
  if (!isNaN(seconds)) return seconds * 1000;

  const date = new Date(retryAfter);
  if (!isNaN(date.getTime())) return Math.max(0, date.getTime() - Date.now());

  return undefined;
}

function extractRateLimitInfo(response: Response): { remaining?: number; reset?: Date } {
  const remaining = response.headers.get("x-rate-limit-remaining") ||
    response.headers.get("x-ratelimit-remaining") ||
    response.headers.get("ratelimit-remaining");

  const reset = response.headers.get("x-rate-limit-reset") ||
    response.headers.get("x-ratelimit-reset") ||
    response.headers.get("ratelimit-reset");

  return {
    remaining: remaining ? parseInt(remaining, 10) : undefined,
    reset: reset ? new Date(parseInt(reset, 10) * 1000) : undefined,
  };
}

export function isRateLimitResponse(response: Response): boolean {
  return response.status === 429;
}

export function createRateLimitError(platform: SocialPlatform, retryAfter?: number): RateLimitError {
  const error = new Error(`Rate limited by ${platform}`) as RateLimitError;
  error.rateLimited = true;
  error.retryAfter = retryAfter;
  error.platform = platform;
  return error;
}

export async function withRetry<T>(
  fn: () => Promise<Response>,
  parser: (response: Response) => Promise<T>,
  options: RetryOptions
): Promise<ApiResponse<T>> {
  const { maxRetries = 3, baseDelayMs = 1000, platform } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fn();
      const rateLimitInfo = extractRateLimitInfo(response);

      if (isRateLimitResponse(response)) {
        const retryAfter = parseRetryAfter(response);
        const waitMs = retryAfter || baseDelayMs * Math.pow(2, attempt);

        if (attempt < maxRetries) {
          logger.warn(`[${platform}] Rate limited, waiting ${waitMs}ms before retry ${attempt + 1}/${maxRetries}`);
          await sleep(waitMs);
          continue;
        }

        throw createRateLimitError(platform, retryAfter ? retryAfter / 1000 : undefined);
      }

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw new Error(`${platform} API error ${response.status}: ${errorBody}`);
      }

      const data = await parser(response);

      return {
        data,
        rateLimitRemaining: rateLimitInfo.remaining,
        rateLimitReset: rateLimitInfo.reset,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if ((error as RateLimitError).rateLimited) throw error;

      if (attempt < maxRetries) {
        const delayMs = baseDelayMs * Math.pow(2, attempt);
        logger.warn(`[${platform}] Request failed, retrying in ${delayMs}ms: ${lastError.message}`);
        await sleep(delayMs);
        continue;
      }
    }
  }

  throw lastError || new Error(`${platform} request failed after ${maxRetries} retries`);
}

export async function fetchWithRetry<T>(
  url: string,
  init: RequestInit,
  platform: SocialPlatform,
  maxRetries = 3
): Promise<ApiResponse<T>> {
  return withRetry(
    () => fetch(url, init),
    response => response.json() as Promise<T>,
    { platform, maxRetries }
  );
}

export function getRateLimitConfig(platform: SocialPlatform) {
  return PLATFORM_RATE_LIMITS[platform];
}

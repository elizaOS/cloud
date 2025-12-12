/**
 * Base HTTP client with rate limiting, retries, and error handling for DeFi APIs
 */

import { logger } from "@/lib/utils/logger";
import type { DeFiApiError, RateLimitInfo } from "./types";

export interface HttpClientConfig {
  baseUrl: string;
  apiKey: string;
  headers?: Record<string, string>;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  params?: Record<string, string | number | boolean | undefined>;
  timeout?: number;
}

export class BaseHttpClient {
  protected readonly baseUrl: string;
  protected readonly apiKey: string;
  protected readonly defaultHeaders: Record<string, string>;
  protected readonly timeout: number;
  protected readonly maxRetries: number;
  protected readonly retryDelay: number;
  protected readonly provider: string;
  private rateLimitInfo: RateLimitInfo | null = null;

  constructor(config: HttpClientConfig, provider: string) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.defaultHeaders = { "Content-Type": "application/json", ...config.headers };
    this.timeout = config.timeout ?? 30000;
    this.maxRetries = config.maxRetries ?? 3;
    this.retryDelay = config.retryDelay ?? 1000;
    this.provider = provider;
  }

  protected buildUrl(
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>
  ): string {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  protected parseRateLimitHeaders(headers: Headers): RateLimitInfo | null {
    const remaining = headers.get("x-ratelimit-remaining");
    const limit = headers.get("x-ratelimit-limit");
    const reset = headers.get("x-ratelimit-reset");

    if (remaining && limit) {
      return {
        remaining: parseInt(remaining, 10),
        limit: parseInt(limit, 10),
        resetAt: reset ? new Date(parseInt(reset, 10) * 1000) : new Date(Date.now() + 60000),
      };
    }
    return null;
  }

  getRateLimitInfo(): RateLimitInfo | null {
    return this.rateLimitInfo;
  }

  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const method = options.method ?? "GET";
    const url = this.buildUrl(endpoint, options.params);
    const headers = { ...this.defaultHeaders, ...options.headers };
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options.timeout ?? this.timeout);

      try {
        const response = await fetch(url, {
          method,
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        this.rateLimitInfo = this.parseRateLimitHeaders(response.headers);

        if (response.status === 429) {
          const retryAfter = response.headers.get("retry-after");
          const waitTime = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : this.retryDelay * Math.pow(2, attempt);

          logger.warn(`[${this.provider}] Rate limited, waiting ${waitTime}ms`);
          if (attempt < this.maxRetries) {
            await this.sleep(waitTime);
            continue;
          }
        }

        if (response.status >= 500 && attempt < this.maxRetries) {
          const waitTime = this.retryDelay * Math.pow(2, attempt);
          logger.warn(`[${this.provider}] Server error ${response.status}, retrying in ${waitTime}ms`);
          await this.sleep(waitTime);
          continue;
        }

        if (!response.ok) {
          throw this.createApiError(response.status, await response.text());
        }

        return (await response.json()) as T;
      } catch (error) {
        clearTimeout(timeoutId);

        if (error instanceof Error && error.name === "AbortError") {
          lastError = new Error(`Request to ${this.provider} timed out after ${this.timeout}ms`);
        } else if (error instanceof Error) {
          lastError = error;
        } else {
          lastError = new Error(`Unknown error from ${this.provider}`);
        }

        const shouldRetry =
          attempt < this.maxRetries &&
          (lastError.message.includes("fetch") ||
            lastError.message.includes("network") ||
            lastError.message.includes("timed out"));

        if (shouldRetry) {
          const waitTime = this.retryDelay * Math.pow(2, attempt);
          logger.warn(`[${this.provider}] Network error, retrying in ${waitTime}ms`);
          await this.sleep(waitTime);
          continue;
        }

        throw lastError;
      }
    }

    throw lastError ?? new Error(`Failed to complete request to ${this.provider}`);
  }

  async get<T>(endpoint: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    return this.request<T>(endpoint, { method: "GET", params });
  }

  async post<T>(endpoint: string, body?: Record<string, unknown>, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    return this.request<T>(endpoint, { method: "POST", body, params });
  }

  private createApiError(statusCode: number, responseBody: string): DeFiApiError & Error {
    let message = `API error from ${this.provider}`;
    let code = "UNKNOWN_ERROR";

    try {
      const parsed = JSON.parse(responseBody);
      message = parsed.message || parsed.error || parsed.msg || message;
      code = parsed.code || parsed.error_code || code;
    } catch {
      message = responseBody || message;
    }

    const error = new Error(message) as DeFiApiError & Error;
    error.code = code;
    error.statusCode = statusCode;
    error.provider = this.provider;
    return error;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      await this.get("/");
      return { healthy: true, latencyMs: Date.now() - start };
    } catch {
      return { healthy: false, latencyMs: Date.now() - start };
    }
  }
}

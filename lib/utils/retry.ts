/**
 * Retry Utility with Circuit Breaker
 *
 * Provides resilient error handling for external service calls,
 * particularly for Vercel AI Gateway OIDC token issues.
 *
 * Features:
 * - Exponential backoff with jitter
 * - Circuit breaker pattern to prevent cascading failures
 * - Configurable retry strategies per error type
 */

import { logger } from "./logger";

/**
 * Error classification for retry decisions
 */
export interface RetryableError {
    /** Whether the error is transient and should be retried */
    isRetryable: boolean;
    /** Whether the error is an OIDC/authentication issue */
    isOIDCError: boolean;
    /** Whether the error indicates the service is unavailable */
    isServiceUnavailable: boolean;
    /** Original error for logging */
    originalError: unknown;
}

/**
 * Circuit breaker state
 */
interface CircuitBreakerState {
    failures: number;
    lastFailureTime: number;
    isOpen: boolean;
    openedAt: number;
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
    /** Number of failures before opening circuit */
    failureThreshold: number;
    /** Time window (ms) to count failures */
    failureWindowMs: number;
    /** How long (ms) to keep circuit open before half-open */
    resetTimeoutMs: number;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
    /** Maximum number of retry attempts */
    maxRetries: number;
    /** Base delay between retries (ms) */
    baseDelayMs: number;
    /** Maximum delay between retries (ms) */
    maxDelayMs: number;
    /** Jitter factor (0-1) to randomize delays */
    jitterFactor: number;
    /** Circuit breaker configuration */
    circuitBreaker?: CircuitBreakerConfig;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    baseDelayMs: 100,
    maxDelayMs: 5000,
    jitterFactor: 0.2,
    circuitBreaker: {
        failureThreshold: 5,
        failureWindowMs: 60000, // 1 minute
        resetTimeoutMs: 30000, // 30 seconds
    },
};

/**
 * Circuit breakers keyed by service name
 */
const circuitBreakers = new Map<string, CircuitBreakerState>();

/**
 * Classifies an error to determine retry behavior
 */
export function classifyError(error: unknown): RetryableError {
    const errorMessage =
        error instanceof Error ? error.message : String(error ?? "");
    const errorString = JSON.stringify(error);

    // OIDC token errors - these are transient and should be retried
    const isOIDCError =
        errorMessage.includes("OIDC") ||
        errorMessage.includes("VERCEL_OIDC_TOKEN") ||
        errorMessage.includes("authentication token") ||
        errorString.includes("OIDC") ||
        errorString.includes("VERCEL_OIDC_TOKEN");

    // Service unavailable errors
    const isServiceUnavailable =
        errorMessage.includes("503") ||
        errorMessage.includes("502") ||
        errorMessage.includes("504") ||
        errorMessage.includes("Service Unavailable") ||
        errorMessage.includes("Gateway Timeout") ||
        errorMessage.includes("Bad Gateway");

    // Network/timeout errors
    const isNetworkError =
        errorMessage.includes("ECONNRESET") ||
        errorMessage.includes("ECONNREFUSED") ||
        errorMessage.includes("ETIMEDOUT") ||
        errorMessage.includes("timeout") ||
        errorMessage.includes("network");

    // Rate limit errors (should retry with backoff)
    const isRateLimitError =
        errorMessage.includes("429") ||
        errorMessage.includes("rate limit") ||
        errorMessage.includes("Too Many Requests");

    // Authentication errors that are NOT OIDC (don't retry these)
    const isPermanentAuthError =
        !isOIDCError &&
        (errorMessage.includes("401") ||
            errorMessage.includes("Unauthorized") ||
            errorMessage.includes("Invalid API key") ||
            errorMessage.includes("API key"));

    const isRetryable =
        (isOIDCError ||
            isServiceUnavailable ||
            isNetworkError ||
            isRateLimitError) &&
        !isPermanentAuthError;

    return {
        isRetryable,
        isOIDCError,
        isServiceUnavailable,
        originalError: error,
    };
}

/**
 * Calculates delay with exponential backoff and jitter
 */
function calculateDelay(
    attempt: number,
    config: Pick<RetryConfig, "baseDelayMs" | "maxDelayMs" | "jitterFactor">,
): number {
    // Exponential backoff: base * 2^attempt
    const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt);
    // Cap at max delay
    const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);
    // Add jitter to prevent thundering herd
    const jitter = cappedDelay * config.jitterFactor * Math.random();
    return cappedDelay + jitter;
}

/**
 * Gets or creates circuit breaker state for a service
 */
function getCircuitBreaker(serviceName: string): CircuitBreakerState {
    let state = circuitBreakers.get(serviceName);
    if (!state) {
        state = {
            failures: 0,
            lastFailureTime: 0,
            isOpen: false,
            openedAt: 0,
        };
        circuitBreakers.set(serviceName, state);
    }
    return state;
}

/**
 * Checks if circuit breaker allows the request
 */
function checkCircuitBreaker(
    serviceName: string,
    config: CircuitBreakerConfig,
): { allowed: boolean; state: "closed" | "open" | "half-open" } {
    const state = getCircuitBreaker(serviceName);
    const now = Date.now();

    if (state.isOpen) {
        // Check if we should transition to half-open
        if (now - state.openedAt >= config.resetTimeoutMs) {
            logger.info(`[CircuitBreaker] ${serviceName} transitioning to half-open`);
            return { allowed: true, state: "half-open" };
        }
        return { allowed: false, state: "open" };
    }

    // Clean up old failures outside the window
    if (now - state.lastFailureTime > config.failureWindowMs) {
        state.failures = 0;
    }

    return { allowed: true, state: "closed" };
}

/**
 * Records a failure for circuit breaker
 */
function recordFailure(serviceName: string, config: CircuitBreakerConfig): void {
    const state = getCircuitBreaker(serviceName);
    const now = Date.now();

    // Clean up old failures outside the window
    if (now - state.lastFailureTime > config.failureWindowMs) {
        state.failures = 0;
    }

    state.failures++;
    state.lastFailureTime = now;

    if (state.failures >= config.failureThreshold) {
        state.isOpen = true;
        state.openedAt = now;
        logger.warn(`[CircuitBreaker] ${serviceName} circuit opened after ${state.failures} failures`);
    }
}

/**
 * Records a success, resetting circuit breaker
 */
function recordSuccess(serviceName: string): void {
    const state = getCircuitBreaker(serviceName);
    if (state.isOpen || state.failures > 0) {
        logger.info(`[CircuitBreaker] ${serviceName} circuit closed after success`);
    }
    state.failures = 0;
    state.isOpen = false;
    state.openedAt = 0;
}

/**
 * Error thrown when circuit breaker is open
 */
export class CircuitBreakerOpenError extends Error {
    readonly serviceName: string;
    readonly resetTimeMs: number;

    constructor(serviceName: string, resetTimeMs: number) {
        super(
            `Circuit breaker is open for ${serviceName}. Service will be retried in ${Math.ceil(resetTimeMs / 1000)}s.`,
        );
        this.name = "CircuitBreakerOpenError";
        this.serviceName = serviceName;
        this.resetTimeMs = resetTimeMs;
    }
}

/**
 * Executes a function with retry logic and circuit breaker
 *
 * @param fn - The async function to execute
 * @param serviceName - Name of the service (for circuit breaker tracking)
 * @param config - Retry configuration
 * @returns The result of the function
 * @throws The last error if all retries fail, or CircuitBreakerOpenError
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   async () => gateway.textEmbeddingModel(model),
 *   'ai-gateway',
 *   { maxRetries: 3 }
 * );
 * ```
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    serviceName: string,
    config: Partial<RetryConfig> = {},
): Promise<T> {
    const fullConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
    const cbConfig = fullConfig.circuitBreaker ?? DEFAULT_RETRY_CONFIG.circuitBreaker!;

    // Check circuit breaker first
    const cbStatus = checkCircuitBreaker(serviceName, cbConfig);
    if (!cbStatus.allowed) {
        const state = getCircuitBreaker(serviceName);
        const resetTimeMs = cbConfig.resetTimeoutMs - (Date.now() - state.openedAt);
        throw new CircuitBreakerOpenError(serviceName, resetTimeMs);
    }

    let lastError: unknown;

    for (let attempt = 0; attempt <= fullConfig.maxRetries; attempt++) {
        try {
            const result = await fn();
            recordSuccess(serviceName);
            return result;
        } catch (error) {
            lastError = error;
            const classified = classifyError(error);

            logger.warn(`[Retry] ${serviceName} attempt ${attempt + 1} failed`, {
                error: error instanceof Error ? error.message : String(error),
                isRetryable: classified.isRetryable,
                isOIDCError: classified.isOIDCError,
                attempt: attempt + 1,
                maxRetries: fullConfig.maxRetries + 1,
            });

            // Don't retry non-retryable errors
            if (!classified.isRetryable) {
                recordFailure(serviceName, cbConfig);
                throw error;
            }

            // Last attempt - don't wait, just fail
            if (attempt === fullConfig.maxRetries) {
                recordFailure(serviceName, cbConfig);
                break;
            }

            // Wait before next attempt
            const delay = calculateDelay(attempt, fullConfig);
            logger.debug(`[Retry] ${serviceName} waiting ${delay}ms before retry`);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}

/**
 * Wraps a function to add retry behavior
 *
 * @param fn - The async function to wrap
 * @param serviceName - Name of the service (for circuit breaker tracking)
 * @param config - Retry configuration
 * @returns A new function with retry behavior
 *
 * @example
 * ```typescript
 * const resilientEmbed = withRetryWrapper(
 *   (text: string) => embedText(text),
 *   'embeddings'
 * );
 * ```
 */
export function withRetryWrapper<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => Promise<TResult>,
    serviceName: string,
    config: Partial<RetryConfig> = {},
): (...args: TArgs) => Promise<TResult> {
    return (...args: TArgs) => withRetry(() => fn(...args), serviceName, config);
}

/**
 * Checks if a service's circuit breaker is currently open
 */
export function isCircuitOpen(serviceName: string): boolean {
    const state = circuitBreakers.get(serviceName);
    return state?.isOpen ?? false;
}

/**
 * Manually resets a circuit breaker (useful for testing or admin actions)
 */
export function resetCircuitBreaker(serviceName: string): void {
    circuitBreakers.delete(serviceName);
    logger.info(`[CircuitBreaker] ${serviceName} manually reset`);
}

/**
 * Gets circuit breaker statistics for monitoring
 */
export function getCircuitBreakerStats(): Map<string, { isOpen: boolean; failures: number; openedAt: number }> {
    const stats = new Map<string, { isOpen: boolean; failures: number; openedAt: number }>();
    for (const [name, state] of circuitBreakers) {
        stats.set(name, {
            isOpen: state.isOpen,
            failures: state.failures,
            openedAt: state.openedAt,
        });
    }
    return stats;
}

/**
 * Custom Error Classes for Deployment Flow
 * Provides specific error types for better error handling and user feedback
 */

export class DeploymentError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "DeploymentError";
  }
}

export class ArtifactUploadError extends DeploymentError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "ARTIFACT_UPLOAD_FAILED", 500, details);
    this.name = "ArtifactUploadError";
  }
}

export class ArtifactDownloadError extends DeploymentError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "ARTIFACT_DOWNLOAD_FAILED", 500, details);
    this.name = "ArtifactDownloadError";
  }
}

export class CloudflareApiError extends DeploymentError {
  constructor(
    message: string,
    public endpoint: string,
    public method: string,
    details?: Record<string, unknown>
  ) {
    super(message, "CLOUDFLARE_API_ERROR", 502, details);
    this.name = "CloudflareApiError";
  }
}

export class ContainerDeploymentError extends DeploymentError {
  constructor(
    message: string,
    public containerId?: string,
    details?: Record<string, unknown>
  ) {
    super(message, "CONTAINER_DEPLOYMENT_FAILED", 500, details);
    this.name = "ContainerDeploymentError";
  }
}

export class InsufficientCreditsError extends DeploymentError {
  constructor(
    required: number,
    available: number,
    details?: Record<string, unknown>
  ) {
    super(
      `Insufficient credits. Required: ${required}, Available: ${available}`,
      "INSUFFICIENT_CREDITS",
      402,
      { required, available, ...details }
    );
    this.name = "InsufficientCreditsError";
  }
}

export class R2CredentialsError extends DeploymentError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "R2_CREDENTIALS_ERROR", 500, details);
    this.name = "R2CredentialsError";
  }
}

export class TimeoutError extends DeploymentError {
  constructor(operation: string, timeoutMs: number) {
    super(
      `Operation '${operation}' timed out after ${timeoutMs}ms`,
      "TIMEOUT",
      504,
      { operation, timeoutMs }
    );
    this.name = "TimeoutError";
  }
}

/**
 * Retry configuration for transient errors
 */
export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

/**
 * Check if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof TimeoutError) return true;
  if (error instanceof CloudflareApiError) {
    // Retry on 5xx errors and rate limits
    return error.statusCode >= 500 || error.statusCode === 429;
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("timeout") ||
      message.includes("econnreset") ||
      message.includes("econnrefused") ||
      message.includes("rate limit") ||
      message.includes("503") ||
      message.includes("502")
    );
  }
  return false;
}

/**
 * Retry wrapper for async operations with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  onRetry?: (attempt: number, error: Error) => void
): Promise<T> {
  const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error;

  for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!isRetryableError(error)) {
        throw lastError;
      }

      if (attempt === finalConfig.maxAttempts) {
        throw lastError;
      }

      const delayMs = Math.min(
        finalConfig.initialDelayMs * Math.pow(finalConfig.backoffMultiplier, attempt - 1),
        finalConfig.maxDelayMs
      );

      if (onRetry) {
        onRetry(attempt, lastError);
      }

      console.warn(
        `Retry attempt ${attempt}/${finalConfig.maxAttempts} after ${delayMs}ms delay. Error: ${lastError.message}`
      );

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError!;
}

/**
 * Timeout wrapper for async operations
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new TimeoutError(operation, timeoutMs));
    }, timeoutMs);
  });

  return Promise.race([fn(), timeoutPromise]);
}

/**
 * Format error for API response
 */
export function formatErrorResponse(error: unknown): {
  success: false;
  error: string;
  code?: string;
  details?: Record<string, unknown>;
} {
  if (error instanceof DeploymentError) {
    return {
      success: false,
      error: error.message,
      code: error.code,
      details: error.details,
    };
  }

  if (error instanceof Error) {
    return {
      success: false,
      error: error.message,
    };
  }

  return {
    success: false,
    error: "An unknown error occurred",
  };
}


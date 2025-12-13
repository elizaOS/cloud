/**
 * Error Handling Utilities
 *
 * Shared utilities for consistent error handling across the codebase.
 * Consolidates duplicate error extraction and handling patterns.
 */

/**
 * Extract error message from unknown error type
 * Replaces common pattern: error instanceof Error ? error.message : "Unknown error"
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return "Unknown error";
}

/**
 * Extract error details for logging
 */
export function extractErrorDetails(error: unknown): {
  message: string;
  name?: string;
  stack?: string;
  cause?: unknown;
} {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
      cause: error.cause,
    };
  }
  return {
    message: extractErrorMessage(error),
  };
}

/**
 * Check if error is a specific type
 */
export function isErrorOfType(error: unknown, typeName: string): boolean {
  return error instanceof Error && error.name === typeName;
}

/**
 * Check if error message contains a specific string
 */
export function errorMessageContains(error: unknown, search: string): boolean {
  return extractErrorMessage(error).toLowerCase().includes(search.toLowerCase());
}


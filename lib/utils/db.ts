/**
 * Database Utilities
 *
 * Shared utilities for database connection error handling, retry logic,
 * and pool monitoring. Consolidates duplicate code from multiple files.
 *
 * @module lib/utils/db
 */

import { logger } from "./logger";

// ============================================================================
// Pool Configuration Constants (for serverless environments)
// ============================================================================

/**
 * Database pool configuration optimized for Neon pooler in serverless.
 * Using Neon's pooled endpoint (-pooler), we can safely increase limits:
 * - Neon pooler handles up to 10,000 concurrent connections server-side
 * - Per-instance pools are just local caches for connection reuse
 */
export const POOL_CONFIG = {
  /** Maximum connections per pool - safe to increase with Neon pooler */
  max: 10,
  /** Keep connections warm for reuse (60s) */
  idleTimeoutMillis: 60_000,
  /** Reasonable timeout for Neon cold starts */
  connectionTimeoutMillis: 15_000,
} as const;

// ============================================================================
// Connection Error Detection
// ============================================================================

/**
 * PostgreSQL error codes that indicate connection issues.
 * See: https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
const PG_CONNECTION_ERROR_CODES = [
  "08p01", // protocol_violation (server conn crashed)
  "08000", // connection_exception
  "08003", // connection_does_not_exist
  "08006", // connection_failure
  "57p01", // admin_shutdown
  "57p02", // crash_shutdown
  "57p03", // cannot_connect_now
] as const;

/**
 * Error message patterns that indicate connection issues.
 * Case-insensitive matching is used.
 */
const CONNECTION_ERROR_PATTERNS = [
  "server conn crashed",
  "cannot use a pool",
  "connection",
  "fatal",
  "closed",
  "terminated",
  "rollback",
  "failed query",
  "end on the pool",
  "socket",
  "econnreset",
  "etimedout",
  "econnrefused",
] as const;

/**
 * Check if an error is a database connection issue.
 * Detects PostgreSQL error codes and common connection error messages.
 *
 * @param error - The error to check
 * @returns true if this is a connection error that may be transient
 *
 * @example
 * ```ts
 * try {
 *   await db.query("SELECT 1");
 * } catch (error) {
 *   if (isConnectionError(error)) {
 *     // Handle transient connection issue
 *   }
 * }
 * ```
 */
export function isConnectionError(error: unknown): boolean {
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();

  // Check for PostgreSQL error codes
  for (const code of PG_CONNECTION_ERROR_CODES) {
    if (message.includes(code)) {
      return true;
    }
  }

  // Check for common connection error patterns
  for (const pattern of CONNECTION_ERROR_PATTERNS) {
    if (message.includes(pattern)) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// Error Categorization
// ============================================================================

/**
 * Error categories for better logging and user feedback.
 */
export type DbErrorCategory =
  | "connection"
  | "timeout"
  | "auth"
  | "constraint"
  | "unknown";

/**
 * Categorize a database error for appropriate handling.
 *
 * @param error - The error to categorize
 * @returns The error category
 */
export function categorizeDbError(error: unknown): DbErrorCategory {
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();

  if (isConnectionError(error)) {
    return "connection";
  }

  if (
    message.includes("timeout") ||
    message.includes("etimedout") ||
    message.includes("timed out")
  ) {
    return "timeout";
  }

  if (
    message.includes("authentication") ||
    message.includes("password") ||
    message.includes("permission denied")
  ) {
    return "auth";
  }

  if (
    message.includes("unique constraint") ||
    message.includes("duplicate key") ||
    message.includes("foreign key")
  ) {
    return "constraint";
  }

  return "unknown";
}

// ============================================================================
// Retry Logic
// ============================================================================

interface RetryOptions {
  /** Maximum number of retry attempts (default: 2) */
  maxRetries?: number;
  /** Base delay in ms between retries (default: 100) */
  baseDelayMs?: number;
  /** Whether to use exponential backoff (default: true) */
  exponentialBackoff?: boolean;
  /** Label for logging (e.g., "[RoomTitle]") */
  label?: string;
}

/**
 * Execute a database operation with automatic retry on connection errors.
 *
 * Only retries on connection errors (transient failures). Other errors
 * are thrown immediately to fail fast.
 *
 * @param operation - The async operation to execute
 * @param options - Retry configuration options
 * @returns The result of the operation
 * @throws The last error if all retries fail
 *
 * @example
 * ```ts
 * const result = await withDbRetry(
 *   () => db.query("SELECT * FROM users"),
 *   { label: "[UsersService]", maxRetries: 2 }
 * );
 * ```
 */
export async function withDbRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 2,
    baseDelayMs = 100,
    exponentialBackoff = true,
    label = "[DB]",
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Only retry on connection errors
      if (!isConnectionError(error)) {
        throw error;
      }

      // Don't retry if this was the last attempt
      if (attempt >= maxRetries) {
        break;
      }

      // Calculate delay with optional exponential backoff
      const delay = exponentialBackoff
        ? baseDelayMs * 2 ** attempt
        : baseDelayMs;

      logger.warn(
        `${label} Connection error, retrying (${attempt + 1}/${maxRetries}) after ${delay}ms`
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// ============================================================================
// Connection Error Tracking (for monitoring)
// ============================================================================

interface ConnectionErrorStats {
  count: number;
  lastError: string;
  lastTimestamp: number;
  windowStart: number;
}

// Track errors per minute to detect systemic issues
const connectionErrorStats: ConnectionErrorStats = {
  count: 0,
  lastError: "",
  lastTimestamp: 0,
  windowStart: Date.now(),
};

const ERROR_WINDOW_MS = 60_000; // 1 minute window
const ERROR_THRESHOLD = 10; // Log warning if > 10 errors per minute

/**
 * Track a connection error for monitoring purposes.
 * Logs a warning if error rate is unusually high.
 *
 * @param error - The connection error
 * @param label - Context label for logging
 */
export function trackConnectionError(error: unknown, label: string): void {
  const now = Date.now();
  const message = error instanceof Error ? error.message : String(error);

  // Reset window if expired
  if (now - connectionErrorStats.windowStart > ERROR_WINDOW_MS) {
    connectionErrorStats.count = 0;
    connectionErrorStats.windowStart = now;
  }

  connectionErrorStats.count++;
  connectionErrorStats.lastError = message.substring(0, 100);
  connectionErrorStats.lastTimestamp = now;

  // Log warning if error rate is high (prevents log spam while maintaining visibility)
  if (connectionErrorStats.count === ERROR_THRESHOLD) {
    logger.warn(
      `${label} High connection error rate: ${connectionErrorStats.count} errors in last minute. ` +
        `Last error: ${connectionErrorStats.lastError}`
    );
  }

  // For individual errors, log at warn level (not debug - we want visibility)
  logger.warn(`${label} Connection error: ${message.substring(0, 100)}`);
}
/**
 * Get current connection error statistics.
 * Useful for health checks and monitoring endpoints.
 */
export function getConnectionErrorStats(): Readonly<ConnectionErrorStats> {
  return { ...connectionErrorStats };
}

/**
 * Reset connection error statistics.
 * Useful for testing or after resolving issues.
 */
export function resetConnectionErrorStats(): void {
  connectionErrorStats.count = 0;
  connectionErrorStats.lastError = "";
  connectionErrorStats.lastTimestamp = 0;
  connectionErrorStats.windowStart = Date.now();
}

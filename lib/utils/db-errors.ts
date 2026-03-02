/**
 * Database error utilities for handling common Postgres error cases.
 * These utilities are the canonical implementations used across the codebase.
 */

/**
 * PostgreSQL unique violation (23505)
 * Detects when a database insert fails due to a unique constraint violation.
 *
 * This function checks:
 * 1. Error message for "unique constraint" or "duplicate key"
 * 2. Postgres error code 23505
 * 3. Recursively follows error.cause chain to handle wrapped DB errors
 *
 * IMPORTANT: This is the single source of truth for unique constraint checking.
 * Do not create local implementations - import and use this function instead.
 * (Previous duplicate in user-service.ts has been consolidated here)
 */
export function isUniqueConstraintError(error: unknown): boolean {
  if (error instanceof Error) {
    const code = (error as { code?: string }).code;
    const cause = (error as { cause?: unknown }).cause;
    return (
      error.message.includes("unique constraint") ||
      error.message.includes("duplicate key") ||
      code === "23505" ||
      (cause !== undefined && isUniqueConstraintError(cause))
    );
  }
  return false;
}

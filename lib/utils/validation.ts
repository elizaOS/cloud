/**
 * Centralized validation utilities.
 * Use these for input validation at API boundaries and entry points.
 */

/**
 * UUID v4 regex pattern for validation.
 * Matches standard UUID format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates that a string is a valid UUID format.
 * Use this to validate user input before database queries.
 *
 * @param value - The string to validate.
 * @returns True if the string is a valid UUID.
 *
 * @example
 * ```ts
 * const characterId = searchParams.characterId;
 * if (characterId && !isValidUUID(characterId)) {
 *   return; // Invalid UUID, skip database query
 * }
 * ```
 */
export function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

/**
 * Sanitizes a potential UUID string by removing invalid trailing characters.
 * Returns undefined if the result is not a valid UUID.
 *
 * Common issue: URL-encoded backslashes (%5C) decode to '\' and append to UUIDs.
 *
 * @param value - The potentially malformed UUID string.
 * @returns The sanitized UUID if valid, undefined otherwise.
 */
export function sanitizeUUID(value: string | undefined | null): string | undefined {
  if (!value) return undefined;

  // Trim whitespace and remove common trailing garbage
  const cleaned = value.trim().replace(/[\\\/\s]+$/, '');

  return isValidUUID(cleaned) ? cleaned : undefined;
}

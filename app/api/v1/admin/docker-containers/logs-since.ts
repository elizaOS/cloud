const RELATIVE_SINCE_RE = /^\d+[smhdw]$/;
/**
 * Strict ISO-8601 timestamp pattern. Accepts:
 *   YYYY-MM-DDTHH:MM:SSZ
 *   YYYY-MM-DDTHH:MM:SS±HH:MM
 *   YYYY-MM-DDTHH:MM:SS.sssZ
 * Rejects locale-dependent strings like "yesterday" or "March 9, 2026".
 */
const ISO8601_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export function isValidDockerLogsSince(value: string): boolean {
  if (!value) return false;

  // Relative durations like "1h", "30m", "2d"
  if (RELATIVE_SINCE_RE.test(value)) {
    return true;
  }

  // Only allow strict ISO-8601 timestamps. Date.parse alone accepts
  // locale-dependent strings which vary across environments.
  if (!ISO8601_RE.test(value)) {
    return false;
  }

  const parsed = Date.parse(value);
  return !Number.isNaN(parsed);
}

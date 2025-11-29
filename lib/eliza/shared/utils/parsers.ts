/**
 * Parser Utilities
 * 
 * Functions for parsing LLM responses and extracting structured data.
 */

/**
 * Parsed plan structure from planning phase
 */
export interface ParsedPlan {
  canRespondNow?: string;
  thought?: string;
  text?: string;
  providers?: string | string[];
  actions?: string | string[];
}

/**
 * Parsed response structure from response phase
 */
export interface ParsedResponse {
  thought?: string;
  text?: string;
}

/**
 * Parse planned items (providers or actions) from XML response
 * Handles both array and comma-separated string formats
 */
export function parsePlannedItems(items: string | string[] | undefined): string[] {
  if (!items) return [];

  const itemArray = Array.isArray(items)
    ? items
    : items.split(",").map((item) => item.trim());

  return itemArray.filter((item) => item && item !== "");
}

/**
 * Check if plan indicates immediate response capability
 */
export function canRespondImmediately(plan: ParsedPlan | null): boolean {
  return (
    plan?.canRespondNow?.toUpperCase() === "YES" ||
    plan?.canRespondNow === "true"
  );
}

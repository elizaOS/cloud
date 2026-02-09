/**
 * Shared Salesforce utilities for MCP tools.
 *
 * Provides: instance URL resolution with bounded cache, API fetch helper,
 * SOQL/SOSL input validation, and configurable API version.
 */

import { logger } from "@/lib/utils/logger";

/** Salesforce REST API version — override via SALESFORCE_API_VERSION env var. */
export const SALESFORCE_API_VERSION = process.env.SALESFORCE_API_VERSION || "v60.0";

// ---------------------------------------------------------------------------
// Instance URL cache (bounded, with TTL)
// ---------------------------------------------------------------------------

const INSTANCE_URL_TTL_MS = 30 * 60 * 1000; // 30 min
const MAX_CACHE_SIZE = 500;

const instanceUrlCache = new Map<string, { url: string; expiresAt: number }>();

/** Remove expired entries, then evict oldest if still over limit. */
function pruneCache(): void {
  const now = Date.now();

  // Remove expired
  for (const [key, entry] of instanceUrlCache) {
    if (entry.expiresAt <= now) instanceUrlCache.delete(key);
  }

  // If still over limit, remove oldest (first inserted — Map preserves insertion order)
  while (instanceUrlCache.size > MAX_CACHE_SIZE) {
    const first = instanceUrlCache.keys().next().value;
    if (first !== undefined) instanceUrlCache.delete(first);
    else break;
  }
}

/**
 * Resolve the Salesforce instance URL for an org.
 * Calls the userinfo endpoint and extracts the custom_domain or profile base URL.
 */
export async function resolveInstanceUrl(token: string, orgId: string): Promise<string> {
  const cached = instanceUrlCache.get(orgId);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const res = await fetch("https://login.salesforce.com/services/oauth2/userinfo", {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to resolve Salesforce instance URL: ${res.status}`);
  }

  const data = await res.json();

  // Prefer custom_domain, fall back to parsing the profile URL
  let instanceUrl: string | undefined;
  if (data.urls?.custom_domain) {
    instanceUrl = data.urls.custom_domain;
  } else if (data.profile) {
    const match = data.profile.match(/^(https:\/\/[^/]+)/);
    if (match) instanceUrl = match[1];
  }

  if (!instanceUrl) {
    throw new Error("Could not determine Salesforce instance URL from userinfo response");
  }

  instanceUrl = instanceUrl.replace(/\/$/, "");

  pruneCache();
  instanceUrlCache.set(orgId, { url: instanceUrl, expiresAt: Date.now() + INSTANCE_URL_TTL_MS });

  return instanceUrl;
}

// ---------------------------------------------------------------------------
// Salesforce REST fetch helper
// ---------------------------------------------------------------------------

/**
 * Perform an authenticated fetch against the Salesforce REST API.
 *
 * @param token  - OAuth access token
 * @param orgId  - Organization ID (for instance URL resolution)
 * @param path   - API path (e.g. `/services/data/v60.0/sobjects/Account`)
 * @param options - Optional fetch RequestInit overrides
 */
export async function salesforceFetch(
  token: string,
  orgId: string,
  path: string,
  options: RequestInit = {},
): Promise<Record<string, unknown>> {
  const instanceUrl = await resolveInstanceUrl(token, orgId);
  const url = `${instanceUrl}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => []);
    const msg = Array.isArray(error) && error[0]?.message
      ? error[0].message
      : error?.message || `Salesforce API error: ${response.status}`;

    logger.error("[SalesforceMCP] API error", {
      status: response.status,
      error,
      path,
    });

    throw new Error(msg);
  }

  if (response.status === 204) return {};
  const text = await response.text();
  if (!text) return {};
  return JSON.parse(text) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Input validation helpers
// ---------------------------------------------------------------------------

/**
 * Basic SOQL query validation — rejects queries that don't start with SELECT.
 */
export function validateSOQL(query: string): void {
  const trimmed = query.trim();
  if (!/^SELECT\s/i.test(trimmed)) {
    throw new Error("Invalid SOQL query: must start with SELECT");
  }
}

/**
 * Basic SOSL search validation — rejects queries that don't start with FIND.
 */
export function validateSOSL(search: string): void {
  const trimmed = search.trim();
  if (!/^FIND\s/i.test(trimmed)) {
    throw new Error("Invalid SOSL search: must start with FIND");
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Strip Salesforce `attributes` metadata from records. */
export function stripAttributes(records: Record<string, unknown>[] | undefined) {
  return records?.map((r) => {
    const { attributes, ...fields } = r;
    return fields;
  });
}

/** Extract a user-friendly error message from an unknown error. */
export function errMsg(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

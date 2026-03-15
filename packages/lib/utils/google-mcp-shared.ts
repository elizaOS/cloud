/**
 * Shared utilities for Google MCP tools.
 *
 * Both the unified MCP server (app/api/mcp/tools/google.ts) and the
 * standalone MCP endpoint (app/api/mcps/google/[transport]/route.ts)
 * use identical mapper, validation, and fetch-wrapper logic.  Keeping
 * a single copy here prevents drift between the two code paths.
 */

import { logger } from "@/lib/utils/logger";

// ── Constants ────────────────────────────────────────────────────────────────

export const GOOGLE_API_TIMEOUT_MS = 30_000;

// ── Authenticated fetch with timeout + rich error extraction ─────────────────

export async function googleFetchWithToken(
  token: string,
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GOOGLE_API_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...options.headers },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`Google API request timed out after ${GOOGLE_API_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  }
  clearTimeout(timeoutId);

  if (!response.ok && response.status !== 204) {
    let errorDetail: string;
    try {
      const errorBody = await response.json();
      const apiMsg = errorBody.error?.message || errorBody.error_description;
      const apiCode = errorBody.error?.code || errorBody.error?.status;
      const parts: string[] = [];
      if (apiMsg) parts.push(apiMsg);
      if (apiCode && apiCode !== response.status) parts.push(`code: ${apiCode}`);
      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        logger.warn("[GoogleMCP] Rate limit hit", { url, retryAfter });
        if (retryAfter) parts.push(`retry after ${retryAfter}s`);
      }
      errorDetail = parts.length > 0 ? parts.join(" — ") : `Google API error: ${response.status}`;
    } catch {
      errorDetail = `Google API error: ${response.status} ${response.statusText}`;
    }
    throw new Error(errorDetail);
  }
  return response;
}

// ── Error message extraction ─────────────────────────────────────────────────

export function errMsg(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

// ── Email helpers ────────────────────────────────────────────────────────────

export function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]/g, "");
}

type EmailPart = {
  body?: { data?: string };
  mimeType?: string;
  parts?: EmailPart[];
};

export function extractBody(payload: Record<string, unknown>): string {
  const current = payload as EmailPart;
  const bodyData = current.body?.data;
  if (typeof bodyData === "string") {
    return Buffer.from(bodyData, "base64").toString("utf-8");
  }
  if (Array.isArray(current.parts)) {
    for (const mimeType of ["text/plain", "text/html"]) {
      for (const part of current.parts) {
        const partBodyData = part.body?.data;
        if (part.mimeType === mimeType && typeof partBodyData === "string") {
          return Buffer.from(partBodyData, "base64").toString("utf-8");
        }
        if (part.mimeType?.startsWith("multipart/")) {
          const nested = extractBody(part as Record<string, unknown>);
          if (nested) return nested;
        }
      }
    }
    for (const part of current.parts) {
      const nested = extractBody(part as Record<string, unknown>);
      if (nested) return nested;
    }
  }
  return "";
}

// ── Mappers ──────────────────────────────────────────────────────────────────

export function mapGmailMessage(d: Record<string, unknown>): Record<string, unknown> {
  const payload = d.payload as Record<string, unknown> | undefined;
  const headers = (payload?.headers as Array<{ name: string; value: string }>) || [];
  return {
    id: d.id,
    threadId: d.threadId,
    snippet: d.snippet,
    labelIds: d.labelIds,
    headers: Object.fromEntries(headers.map((h) => [h.name, h.value])),
    internalDate: d.internalDate
      ? new Date(Number.parseInt(d.internalDate as string, 10)).toISOString()
      : undefined,
  };
}

export function mapCalendarEvent(e: Record<string, unknown>): Record<string, unknown> {
  const start = e.start as Record<string, unknown> | undefined;
  const end = e.end as Record<string, unknown> | undefined;
  const attendees = e.attendees as Array<Record<string, unknown>> | undefined;
  return {
    id: e.id,
    summary: e.summary,
    description: e.description,
    start: start?.dateTime || start?.date,
    end: end?.dateTime || end?.date,
    location: e.location,
    status: e.status,
    htmlLink: e.htmlLink,
    attendees: attendees?.map((a) => ({
      email: a.email,
      displayName: a.displayName,
      responseStatus: a.responseStatus,
    })),
    organizer: e.organizer,
  };
}

export function mapContact(person: Record<string, unknown>): Record<string, unknown> {
  const p = (person.person || person) as Record<string, unknown>;
  const names = p.names as Array<Record<string, unknown>> | undefined;
  const emails = p.emailAddresses as Array<Record<string, unknown>> | undefined;
  const phones = p.phoneNumbers as Array<Record<string, unknown>> | undefined;
  const orgs = p.organizations as Array<Record<string, unknown>> | undefined;
  return {
    resourceName: p.resourceName,
    name: names?.[0]?.displayName,
    email: emails?.[0]?.value,
    phone: phones?.[0]?.value,
    organization: orgs?.[0]?.name,
  };
}

// ── Timezone helpers ─────────────────────────────────────────────────────────

/**
 * Applies a timezone to a datetime string for Google Calendar API.
 *
 * If the datetime ends with "Z" (UTC) and a timezone is provided, this would
 * silently reinterpret the UTC time as local — e.g. 15:00Z with Asia/Kolkata
 * would become 15:00 IST (a 5.5-hour shift). We reject that case explicitly.
 */
export function applyTimeZone(
  dateTime: string,
  timeZone: string | undefined,
): { dateTime: string; timeZone?: string } {
  if (!timeZone) return { dateTime };
  if (dateTime.endsWith("Z")) {
    throw new Error(
      `DateTime "${dateTime}" has a UTC 'Z' suffix but timeZone "${timeZone}" was also provided. Pass the time as a local datetime without 'Z' (e.g. '2026-02-21T15:00:00') and set the timeZone parameter, or pass a UTC datetime with 'Z' and omit timeZone.`,
    );
  }
  return { dateTime, timeZone };
}

const calendarTzCache = new Map<string, { value: string | null; expiresAt: number }>();
const CALENDAR_TZ_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetches the primary calendar timezone for an org, with in-memory caching.
 *
 * @param fetchFn - Authenticated fetch function (already bound to the org's token).
 * @param cacheKey - Unique key for caching (typically the org ID).
 */
export async function getCalendarTimeZone(
  fetchFn: (url: string) => Promise<Response>,
  cacheKey: string,
): Promise<string | null> {
  const now = Date.now();
  const cached = calendarTzCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  try {
    const res = await fetchFn("https://www.googleapis.com/calendar/v3/calendars/primary");
    const data = await res.json();
    const tz = (data.timeZone as string) || null;
    calendarTzCache.set(cacheKey, { value: tz, expiresAt: now + CALENDAR_TZ_CACHE_TTL_MS });
    return tz;
  } catch {
    return null;
  }
}

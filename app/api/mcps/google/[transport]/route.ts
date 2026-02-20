// @ts-nocheck — MCP tool types cause exponential type inference
/**
 * Google MCP Server - Gmail, Calendar, Contacts
 *
 * Standalone MCP endpoint for Google tools with per-org OAuth.
 * Config: { "type": "streamable-http", "url": "/api/mcps/google/streamable-http" }
 */

import type { NextRequest } from "next/server";
import { logger } from "@/lib/utils/logger";
import { oauthService } from "@/lib/services/oauth";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { authContextStorage } from "@/app/api/mcp/lib/context";

export const maxDuration = 60;

interface McpHandlerResponse {
  status: number;
  headers?: Headers;
  text?: () => Promise<string>;
}

function isMcpHandlerResponse(resp: unknown): resp is McpHandlerResponse {
  return typeof resp === "object" && resp !== null && typeof (resp as McpHandlerResponse).status === "number";
}

let mcpHandler: ((req: Request) => Promise<Response>) | null = null;

const GOOGLE_API_TIMEOUT_MS = 30_000;

async function getGoogleMcpHandler() {
  if (mcpHandler) return mcpHandler;

  const { createMcpHandler } = await import("mcp-handler");
  const { z } = await import("zod/v3");

  function getOrgId(): string {
    const ctx = authContextStorage.getStore();
    if (!ctx) throw new Error("Not authenticated");
    return ctx.user.organization_id;
  }

  async function getGoogleToken(organizationId: string): Promise<string> {
    try {
      const result = await oauthService.getValidTokenByPlatform({ organizationId, platform: "google" });
      return result.accessToken;
    } catch (error) {
      logger.warn("[GoogleMCP] Failed to get token", {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error("Google account not connected. Connect in Settings > Connections.");
    }
  }

  async function googleFetch(orgId: string, url: string, options: RequestInit = {}): Promise<Response> {
    const token = await getGoogleToken(orgId);
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

  function sanitizeHeaderValue(value: string): string {
    return value.replace(/[\r\n]/g, "");
  }

  function extractBody(payload: Record<string, unknown>): string {
    if (payload?.body?.data) {
      return Buffer.from(payload.body.data, "base64").toString("utf-8");
    }
    if (payload?.parts && Array.isArray(payload.parts)) {
      for (const mimeType of ["text/plain", "text/html"]) {
        for (const part of payload.parts) {
          if (part.mimeType === mimeType && part.body?.data) {
            return Buffer.from(part.body.data, "base64").toString("utf-8");
          }
          if (part.mimeType?.startsWith("multipart/")) {
            const nested = extractBody(part);
            if (nested) return nested;
          }
        }
      }
      for (const part of payload.parts) {
        const nested = extractBody(part);
        if (nested) return nested;
      }
    }
    return "";
  }

  function mapGmailMessage(d: Record<string, unknown>): Record<string, unknown> {
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

  function mapCalendarEvent(e: Record<string, unknown>): Record<string, unknown> {
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

  function mapContact(person: Record<string, unknown>): Record<string, unknown> {
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

  function jsonResult(data: object) {
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }

  function errorResult(msg: string) {
    return { content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }], isError: true };
  }

  function errMsg(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  async function getCalendarTimeZone(orgId: string): Promise<string | null> {
    try {
      const res = await googleFetch(orgId, "https://www.googleapis.com/calendar/v3/calendars/primary");
      const data = await res.json();
      return (data.timeZone as string) || null;
    } catch {
      return null;
    }
  }

  function applyTimeZone(dateTime: string, timeZone: string | undefined): { dateTime: string; timeZone?: string } {
    if (!timeZone) return { dateTime };
    const stripped = dateTime.endsWith("Z") ? dateTime.slice(0, -1) : dateTime;
    return { dateTime: stripped, timeZone };
  }

  mcpHandler = createMcpHandler(
    (server) => {
      // ── google_status ──────────────────────────────────────────────────

      server.tool("google_status", "Check Google OAuth connection status, permissions, and calendar timezone. The calendarTimeZone field is an IANA timezone string — use it for all calendar operations.", {}, async () => {
        try {
          const orgId = getOrgId();
          const connections = await oauthService.listConnections({ organizationId: orgId, platform: "google" });
          const active = connections.find((c) => c.status === "active");
          if (!active) {
            const expired = connections.find((c) => c.status === "expired");
            if (expired) {
              return jsonResult({
                connected: false,
                status: "expired",
                message: "Google connection expired. Please reconnect in Settings > Connections.",
              });
            }
            return jsonResult({ connected: false });
          }

          const calendarTimeZone = await getCalendarTimeZone(orgId);

          return jsonResult({
            connected: true,
            email: active.email,
            scopes: active.scopes,
            linkedAt: active.linkedAt,
            calendarTimeZone,
          });
        } catch (e) {
          return errorResult(errMsg(e, "Failed to check status"));
        }
      });

      // ── gmail_send ─────────────────────────────────────────────────────

      server.tool(
        "gmail_send",
        "Send email via Gmail. Supports plain text and HTML, with CC/BCC.",
        {
          to: z.string().min(1).describe("Recipient(s), comma-separated email addresses"),
          subject: z.string().min(1).describe("Subject line"),
          body: z.string().min(1).describe("Email body content"),
          isHtml: z.boolean().optional().default(false).describe("Send as HTML format"),
          cc: z.string().optional().describe("CC recipients, comma-separated"),
          bcc: z.string().optional().describe("BCC recipients, comma-separated"),
        },
        async ({ to, subject, body, isHtml = false, cc, bcc }) => {
          try {
            const orgId = getOrgId();
            const headers = [
              `To: ${sanitizeHeaderValue(to)}`,
              `Subject: ${sanitizeHeaderValue(subject)}`,
              `Content-Type: ${isHtml ? "text/html" : "text/plain"}; charset=utf-8`,
              ...(cc ? [`Cc: ${sanitizeHeaderValue(cc)}`] : []),
              ...(bcc ? [`Bcc: ${sanitizeHeaderValue(bcc)}`] : []),
            ];
            const raw = Buffer.from([...headers, "", body].join("\r\n"))
              .toString("base64")
              .replace(/\+/g, "-")
              .replace(/\//g, "_")
              .replace(/=+$/, "");

            const res = await googleFetch(orgId, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ raw }),
            });
            const result = await res.json();
            logger.warn("[GoogleMCP] Email sent", { messageId: result.id, to });
            return jsonResult({ success: true, messageId: result.id, threadId: result.threadId });
          } catch (e) {
            return errorResult(errMsg(e, "Failed to send email"));
          }
        },
      );

      // ── gmail_list ─────────────────────────────────────────────────────

      server.tool(
        "gmail_list",
        "List and search emails from Gmail. Supports date filtering via 'after' and 'before' parameters (converts to Gmail query syntax automatically), pagination, and label filtering. For advanced queries, use the 'query' parameter with Gmail search operators like 'from:x@y.com', 'is:unread', 'has:attachment'.",
        {
          query: z.string().optional().describe("Gmail search query (supports operators: from:user, to:user, subject:text, is:unread, is:starred, has:attachment, label:name, newer_than:7d)"),
          maxResults: z.number().int().min(1).max(50).optional().default(10).describe("Max emails per page (1-50, default 10)"),
          labelIds: z.string().optional().describe("Label IDs, comma-separated (e.g. 'INBOX', 'UNREAD', 'STARRED')"),
          after: z.string().optional().describe("Only emails after this date (ISO 8601, e.g. 2026-02-13T00:00:00Z). Automatically added to query."),
          before: z.string().optional().describe("Only emails before this date (ISO 8601, e.g. 2026-02-20T00:00:00Z). Automatically added to query."),
          pageToken: z.string().optional().describe("Token from a previous response's nextPageToken to fetch the next page"),
        },
        async ({ query, maxResults = 10, labelIds, after, before, pageToken }) => {
          try {
            const orgId = getOrgId();
            let effectiveQuery = query || "";

            if (after) {
              const d = new Date(after);
              if (Number.isNaN(d.getTime())) {
                return errorResult(`Invalid 'after' date: "${after}". Use ISO 8601 format, e.g. 2026-02-13T00:00:00Z`);
              }
              effectiveQuery += ` after:${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
            }
            if (before) {
              const d = new Date(before);
              if (Number.isNaN(d.getTime())) {
                return errorResult(`Invalid 'before' date: "${before}". Use ISO 8601 format, e.g. 2026-02-20T00:00:00Z`);
              }
              effectiveQuery += ` before:${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
            }
            effectiveQuery = effectiveQuery.trim();

            const params = new URLSearchParams({ maxResults: String(maxResults) });
            if (effectiveQuery) params.set("q", effectiveQuery);
            if (pageToken) params.set("pageToken", pageToken);
            if (labelIds) {
              for (const id of labelIds.split(",")) {
                params.append("labelIds", id.trim());
              }
            }

            const listRes = await googleFetch(orgId, `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`);
            const listData = await listRes.json();
            const messages = listData.messages || [];
            const nextPageToken = listData.nextPageToken || null;
            const resultSizeEstimate = listData.resultSizeEstimate || 0;

            if (messages.length === 0) {
              return jsonResult({ resultCount: 0, messages: [], nextPageToken: null, resultSizeEstimate });
            }

            const messageIds = messages.slice(0, maxResults).map((m: { id: string }) => m.id);
            const results = await Promise.all(
              messageIds.map(async (id: string) => {
                try {
                  const res = await googleFetch(
                    orgId,
                    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
                  );
                  return { ok: true, data: await res.json() };
                } catch {
                  return { ok: false, id };
                }
              }),
            );

            const successes = results.filter((r) => r.ok).map((r) => r.data);
            const failCount = results.filter((r) => !r.ok).length;

            if (failCount > 0) {
              logger.warn("[GoogleMCP] Some messages failed to fetch", { failed: failCount, total: messageIds.length });
            }

            return jsonResult({
              resultCount: successes.length,
              messages: successes.map(mapGmailMessage),
              nextPageToken,
              resultSizeEstimate,
              ...(failCount > 0 && { failedToFetch: failCount }),
            });
          } catch (e) {
            return errorResult(errMsg(e, "Failed to list emails"));
          }
        },
      );

      // ── gmail_read ─────────────────────────────────────────────────────

      server.tool(
        "gmail_read",
        "Read a specific email by its message ID with full content including body text, headers, and labels.",
        {
          messageId: z.string().min(1).describe("Gmail message ID"),
          format: z.enum(["full", "metadata", "minimal"]).optional().default("full").describe("Response format: full (with body), metadata (headers only), or minimal"),
        },
        async ({ messageId, format = "full" }) => {
          try {
            const orgId = getOrgId();
            const res = await googleFetch(
              orgId,
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=${format}`,
            );
            const msg = await res.json();

            if (!msg.payload) {
              return jsonResult({
                id: msg.id, threadId: msg.threadId, labelIds: msg.labelIds, snippet: msg.snippet,
                headers: {}, body: "",
                internalDate: msg.internalDate ? new Date(Number.parseInt(msg.internalDate, 10)).toISOString() : undefined,
              });
            }

            return jsonResult({
              id: msg.id, threadId: msg.threadId, labelIds: msg.labelIds, snippet: msg.snippet,
              headers: Object.fromEntries(msg.payload.headers?.map((h: { name: string; value: string }) => [h.name, h.value]) || []),
              body: extractBody(msg.payload),
              internalDate: msg.internalDate ? new Date(Number.parseInt(msg.internalDate, 10)).toISOString() : undefined,
            });
          } catch (e) {
            return errorResult(errMsg(e, "Failed to read email"));
          }
        },
      );

      // ── calendar_list_events ───────────────────────────────────────────

      server.tool(
        "calendar_list_events",
        "List calendar events. Returns both past and future events when date filters are provided. Without any date filter, defaults to upcoming events only. Supports pagination. Convert natural language dates to ISO 8601 before calling. Event times in the response are in the user's calendar timezone.",
        {
          maxResults: z.number().int().min(1).max(250).optional().default(10).describe("Max events per page (1-250, default 10)"),
          timeMin: z.string().optional().describe("Only events after this time (ISO 8601, e.g. 2026-02-13T00:00:00Z). Omit to default to now."),
          timeMax: z.string().optional().describe("Only events before this time (ISO 8601, e.g. 2026-02-20T23:59:59Z)"),
          calendarId: z.string().optional().default("primary").describe("Calendar ID (default: 'primary')"),
          query: z.string().optional().describe("Free-text search across event fields"),
          timeZone: z.string().optional().describe("IANA timezone for the response (e.g. 'Asia/Kolkata'). Event times will be returned in this timezone."),
          pageToken: z.string().optional().describe("Token from a previous response's nextPageToken to fetch the next page"),
        },
        async ({ maxResults = 10, timeMin, timeMax, calendarId = "primary", query, timeZone, pageToken }) => {
          try {
            if (timeMin && Number.isNaN(new Date(timeMin).getTime())) {
              return errorResult(`Invalid 'timeMin' date: "${timeMin}". Use ISO 8601 format, e.g. 2026-02-13T00:00:00Z`);
            }
            if (timeMax && Number.isNaN(new Date(timeMax).getTime())) {
              return errorResult(`Invalid 'timeMax' date: "${timeMax}". Use ISO 8601 format, e.g. 2026-02-20T23:59:59Z`);
            }

            const orgId = getOrgId();
            const params = new URLSearchParams({
              maxResults: String(maxResults),
              singleEvents: "true",
              orderBy: "startTime",
            });
            if (timeMin) {
              params.set("timeMin", timeMin);
            } else if (!timeMax) {
              params.set("timeMin", new Date().toISOString());
            }
            if (timeMax) params.set("timeMax", timeMax);
            if (query) params.set("q", query);
            if (pageToken) params.set("pageToken", pageToken);

            const tz = timeZone || (await getCalendarTimeZone(orgId));
            if (tz) params.set("timeZone", tz);

            const res = await googleFetch(
              orgId,
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
            );
            const data = await res.json();
            const items = data.items || [];

            return jsonResult({
              resultCount: items.length,
              events: items.map(mapCalendarEvent),
              nextPageToken: data.nextPageToken || null,
              ...(tz && { timeZone: tz }),
            });
          } catch (e) {
            return errorResult(errMsg(e, "Failed to list events"));
          }
        },
      );

      // ── calendar_create_event ──────────────────────────────────────────

      server.tool(
        "calendar_create_event",
        "Create a new calendar event. IMPORTANT: Pass times as LOCAL times without 'Z' suffix (e.g. '2026-02-21T15:00:00' for 3pm local) and always provide the timeZone parameter. Get the user's timezone from google_status → calendarTimeZone. Supports attendees, location, and notification preferences.",
        {
          summary: z.string().min(1).describe("Event title"),
          start: z.string().min(1).describe("Start time as LOCAL time (e.g. '2026-02-21T15:00:00' for 3pm). Do NOT append 'Z' — use the timeZone parameter instead."),
          end: z.string().min(1).describe("End time as LOCAL time (e.g. '2026-02-21T16:00:00' for 4pm). Do NOT append 'Z' — use the timeZone parameter instead."),
          timeZone: z.string().optional().describe("IANA timezone for start/end times (e.g. 'Asia/Kolkata', 'America/New_York'). Get from google_status → calendarTimeZone. If omitted, fetched automatically from user's calendar."),
          description: z.string().optional().describe("Event description/notes"),
          location: z.string().optional().describe("Event location"),
          attendees: z.array(z.string().email()).optional().describe("Attendee email addresses"),
          calendarId: z.string().optional().default("primary").describe("Calendar ID (default: 'primary')"),
          sendUpdates: z.enum(["all", "externalOnly", "none"]).optional().default("all").describe("Who to send email notifications to"),
        },
        async ({ summary, start, end, timeZone, description, location, attendees, calendarId = "primary", sendUpdates = "all" }) => {
          try {
            const orgId = getOrgId();
            const tz = timeZone || (await getCalendarTimeZone(orgId)) || undefined;

            const event: Record<string, unknown> = {
              summary,
              start: applyTimeZone(start, tz),
              end: applyTimeZone(end, tz),
              ...(description && { description }),
              ...(location && { location }),
              ...(attendees?.length && { attendees: attendees.map((email: string) => ({ email })) }),
            };

            const res = await googleFetch(
              orgId,
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=${sendUpdates}`,
              { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(event) },
            );
            const result = await res.json();
            logger.warn("[GoogleMCP] Event created", { eventId: result.id, summary, timeZone: tz });
            return jsonResult({ success: true, eventId: result.id, htmlLink: result.htmlLink, status: result.status });
          } catch (e) {
            return errorResult(errMsg(e, "Failed to create event"));
          }
        },
      );

      // ── calendar_update_event ──────────────────────────────────────────

      server.tool(
        "calendar_update_event",
        "Update an existing calendar event. Fetches the current event first, then applies your changes. Only provide fields you want to change. IMPORTANT: For time changes, pass LOCAL times without 'Z' suffix and provide the timeZone parameter.",
        {
          eventId: z.string().min(1).describe("Event ID to update"),
          summary: z.string().optional().describe("New event title"),
          start: z.string().optional().describe("New start time as LOCAL time (e.g. '2026-02-21T15:00:00'). Do NOT append 'Z' — use the timeZone parameter instead."),
          end: z.string().optional().describe("New end time as LOCAL time. Do NOT append 'Z' — use the timeZone parameter instead."),
          timeZone: z.string().optional().describe("IANA timezone for start/end times (e.g. 'Asia/Kolkata'). Get from google_status → calendarTimeZone. If omitted, fetched automatically from user's calendar."),
          description: z.string().optional().describe("New description"),
          location: z.string().optional().describe("New location"),
          calendarId: z.string().optional().default("primary").describe("Calendar ID (default: 'primary')"),
          sendUpdates: z.enum(["all", "externalOnly", "none"]).optional().default("all").describe("Who to send email notifications to"),
        },
        async ({ eventId, summary, start, end, timeZone, description, location, calendarId = "primary", sendUpdates = "all" }) => {
          try {
            const orgId = getOrgId();
            const baseUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;

            const existingRes = await googleFetch(orgId, baseUrl);
            const existing = await existingRes.json();

            const tz = timeZone || (await getCalendarTimeZone(orgId)) || undefined;

            const updated = {
              ...existing,
              ...(summary && { summary }),
              ...(description !== undefined && { description }),
              ...(location !== undefined && { location }),
              ...(start && { start: applyTimeZone(start, tz) }),
              ...(end && { end: applyTimeZone(end, tz) }),
            };

            const res = await googleFetch(orgId, `${baseUrl}?sendUpdates=${sendUpdates}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(updated),
            });
            const result = await res.json();
            logger.warn("[GoogleMCP] Event updated", { eventId: result.id, timeZone: tz });
            return jsonResult({ success: true, eventId: result.id, htmlLink: result.htmlLink, updated: result.updated });
          } catch (e) {
            return errorResult(errMsg(e, "Failed to update event"));
          }
        },
      );

      // ── calendar_delete_event ──────────────────────────────────────────

      server.tool(
        "calendar_delete_event",
        "Delete a calendar event. This action cannot be undone.",
        {
          eventId: z.string().min(1).describe("Event ID to delete"),
          calendarId: z.string().optional().default("primary").describe("Calendar ID (default: 'primary')"),
          sendUpdates: z.enum(["all", "externalOnly", "none"]).optional().default("all").describe("Who to send cancellation notifications to"),
        },
        async ({ eventId, calendarId = "primary", sendUpdates = "all" }) => {
          try {
            const orgId = getOrgId();
            await googleFetch(
              orgId,
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=${sendUpdates}`,
              { method: "DELETE" },
            );
            logger.warn("[GoogleMCP] Event deleted", { eventId, calendarId });
            return jsonResult({ success: true, deleted: true, eventId });
          } catch (e) {
            return errorResult(errMsg(e, "Failed to delete event"));
          }
        },
      );

      // ── contacts_list ──────────────────────────────────────────────────

      server.tool(
        "contacts_list",
        "List or search Google contacts. When a query is provided, uses the Google Contacts search API. Otherwise lists connections. Supports pagination for large contact lists.",
        {
          pageSize: z.number().int().min(1).max(100).optional().default(20).describe("Contacts per page (1-100, default 20)"),
          query: z.string().optional().describe("Search query to find contacts by name, email, phone, or organization"),
          pageToken: z.string().optional().describe("Token from a previous response's nextPageToken to fetch the next page"),
        },
        async ({ pageSize = 20, query, pageToken }) => {
          try {
            const orgId = getOrgId();
            const params = new URLSearchParams({
              pageSize: String(pageSize),
              personFields: "names,emailAddresses,phoneNumbers,organizations",
            });

            let url = "https://people.googleapis.com/v1/people/me/connections";
            if (query) {
              url = "https://people.googleapis.com/v1/people:searchContacts";
              params.set("query", query);
              params.set("readMask", "names,emailAddresses,phoneNumbers,organizations");
            } else if (pageToken) {
              params.set("pageToken", pageToken);
            }

            const res = await googleFetch(orgId, `${url}?${params}`);
            const data = await res.json();
            const items = data.connections || data.results || [];

            const result: Record<string, unknown> = {
              resultCount: items.length,
              contacts: items.map(mapContact),
              nextPageToken: data.nextPageToken || null,
            };
            if (query && pageToken) {
              result.note = "Google Contacts search does not support pagination. The pageToken was ignored. To see more results, increase pageSize (max 100).";
            }

            return jsonResult(result);
          } catch (e) {
            return errorResult(errMsg(e, "Failed to list contacts"));
          }
        },
      );
    },
    { capabilities: { tools: {} } },
    { streamableHttpEndpoint: "/api/mcps/google/streamable-http", disableSse: true, maxDuration: 60 },
  );

  return mcpHandler;
}

async function handleRequest(req: NextRequest, { params }: { params: Promise<{ transport: string }> }): Promise<Response> {
  const { transport } = await params;
  if (transport !== "streamable-http") {
    return new Response(
      JSON.stringify({ error: `Transport "${transport}" not supported. Use streamable-http.` }),
      { status: 405, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const authResult = await requireAuthOrApiKeyWithOrg(req);

    const handler = await getGoogleMcpHandler();
    const mcpResponse = await authContextStorage.run(authResult, () => handler(req as Request));

    if (!mcpResponse || !isMcpHandlerResponse(mcpResponse)) {
      return new Response(JSON.stringify({ error: "invalid_response" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    const bodyText = mcpResponse.text ? await mcpResponse.text() : "";
    const headers: Record<string, string> = {};
    mcpResponse.headers?.forEach((v: string, k: string) => { headers[k] = v; });

    return new Response(bodyText, { status: mcpResponse.status, headers });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    logger.error(`[GoogleMCP] ${msg}`);
    const isAuth = msg.includes("API key") || msg.includes("auth") || msg.includes("Unauthorized");
    return new Response(
      JSON.stringify({ error: isAuth ? "authentication_required" : "internal_error", message: msg }),
      { status: isAuth ? 401 : 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

export const GET = handleRequest;
export const POST = handleRequest;
export const DELETE = handleRequest;

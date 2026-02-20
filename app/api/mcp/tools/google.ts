// @ts-nocheck — MCP tool types cause exponential type inference
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";
import { logger } from "@/lib/utils/logger";
import { oauthService } from "@/lib/services/oauth";
import { getAuthContext } from "../lib/context";
import { jsonResponse, errorResponse } from "../lib/responses";

async function getGoogleToken(): Promise<string> {
  const { user } = getAuthContext();
  try {
    const result = await oauthService.getValidTokenByPlatform({
      organizationId: user.organization_id,
      platform: "google",
    });
    return result.accessToken;
  } catch (error) {
    logger.warn("[GoogleMCP] Failed to get token", {
      organizationId: user.organization_id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error("Google account not connected. Connect in Settings > Connections.");
  }
}

const GOOGLE_API_TIMEOUT_MS = 30_000;

async function googleFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getGoogleToken();
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

function errMsg(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  return error.message;
}

/** Sanitize email header values to prevent CRLF injection attacks. */
function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]/g, "");
}

/** Recursively extract text body from Gmail payload (handles nested multipart). */
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

// ── Shared mappers ───────────────────────────────────────────────────────────

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

export function registerGoogleTools(server: McpServer): void {
  server.registerTool(
    "google_status",
    {
      description: "Check Google OAuth connection status and permissions",
      inputSchema: {},
    },
    async () => {
      try {
        const { user } = getAuthContext();
        const connections = await oauthService.listConnections({
          organizationId: user.organization_id,
          platform: "google",
        });

        const active = connections.find((c) => c.status === "active");
        if (!active) {
          return jsonResponse({
            connected: false,
            message: "Google not connected. Connect in Settings > Connections.",
          });
        }

        return jsonResponse({
          connected: true,
          email: active.email,
          scopes: active.scopes,
          linkedAt: active.linkedAt,
        });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to check status"));
      }
    },
  );

  server.registerTool(
    "gmail_send",
    {
      description: "Send email via Gmail. Supports plain text and HTML, with CC/BCC.",
      inputSchema: {
        to: z.string().min(1).describe("Recipient(s), comma-separated email addresses"),
        subject: z.string().min(1).describe("Subject line"),
        body: z.string().min(1).describe("Email body content"),
        isHtml: z.boolean().optional().default(false).describe("Send as HTML format"),
        cc: z.string().optional().describe("CC recipients, comma-separated"),
        bcc: z.string().optional().describe("BCC recipients, comma-separated"),
      },
    },
    async ({ to, subject, body, isHtml = false, cc, bcc }) => {
      try {
        const headers = [
          `To: ${sanitizeHeaderValue(to)}`,
          `Subject: ${sanitizeHeaderValue(subject)}`,
          `Content-Type: ${isHtml ? "text/html" : "text/plain"}; charset=utf-8`,
          ...(cc ? [`Cc: ${sanitizeHeaderValue(cc)}`] : []),
          ...(bcc ? [`Bcc: ${sanitizeHeaderValue(bcc)}`] : []),
        ];

        const message = [...headers, "", body].join("\r\n");
        const raw = Buffer.from(message)
          .toString("base64")
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");

        const response = await googleFetch(
          "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ raw }),
          },
        );

        const result = await response.json();
        logger.warn("[GoogleMCP] Email sent", { messageId: result.id, to });

        return jsonResponse({
          success: true,
          messageId: result.id,
          threadId: result.threadId,
        });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to send email"));
      }
    },
  );

  server.registerTool(
    "gmail_list",
    {
      description: "List and search emails from Gmail. Supports date filtering via 'after' and 'before' parameters (converts to Gmail query syntax automatically), pagination for fetching all results, and label filtering. For advanced queries, use the 'query' parameter with Gmail search operators like 'from:x@y.com', 'is:unread', 'has:attachment'.",
      inputSchema: {
        query: z.string().optional().describe("Gmail search query (supports operators: from:user, to:user, subject:text, is:unread, is:starred, has:attachment, label:name, newer_than:7d, etc.)"),
        maxResults: z.number().int().min(1).max(50).optional().default(10).describe("Max emails per page (1-50, default 10)"),
        labelIds: z.string().optional().describe("Label IDs, comma-separated (e.g., 'INBOX', 'UNREAD', 'STARRED')"),
        after: z.string().optional().describe("Only emails after this date (ISO 8601, e.g. 2026-02-13T00:00:00Z). Automatically added to query."),
        before: z.string().optional().describe("Only emails before this date (ISO 8601, e.g. 2026-02-20T00:00:00Z). Automatically added to query."),
        pageToken: z.string().optional().describe("Token from a previous response's nextPageToken to fetch the next page of results"),
      },
    },
    async ({ query, maxResults = 10, labelIds, after, before, pageToken }) => {
      try {
        let effectiveQuery = query || "";
        if (after) {
          const d = new Date(after);
          if (Number.isNaN(d.getTime())) {
            return errorResponse(`Invalid 'after' date: "${after}". Use ISO 8601 format, e.g. 2026-02-13T00:00:00Z`);
          }
          effectiveQuery += ` after:${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
        }
        if (before) {
          const d = new Date(before);
          if (Number.isNaN(d.getTime())) {
            return errorResponse(`Invalid 'before' date: "${before}". Use ISO 8601 format, e.g. 2026-02-20T00:00:00Z`);
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

        const listResponse = await googleFetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
        );
        const listData = await listResponse.json();
        const messages = listData.messages || [];
        const nextPageToken = listData.nextPageToken || null;
        const resultSizeEstimate = listData.resultSizeEstimate || 0;

        if (messages.length === 0) {
          return jsonResponse({
            resultCount: 0,
            messages: [],
            nextPageToken: null,
            resultSizeEstimate,
          });
        }

        const messageIds = messages.slice(0, maxResults).map((m: { id: string }) => m.id);
        const results = await Promise.all(
          messageIds.map(async (id: string) => {
            try {
              const res = await googleFetch(
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

        return jsonResponse({
          resultCount: successes.length,
          messages: successes.map(mapGmailMessage),
          nextPageToken,
          resultSizeEstimate,
          ...(failCount > 0 && { failedToFetch: failCount }),
        });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to list emails"));
      }
    },
  );

  server.registerTool(
    "gmail_read",
    {
      description: "Read a specific email by its message ID with full content including body text, headers, and labels.",
      inputSchema: {
        messageId: z.string().min(1).describe("Gmail message ID"),
        format: z.enum(["full", "metadata", "minimal"]).optional().default("full").describe("Response format: full (with body), metadata (headers only), or minimal"),
      },
    },
    async ({ messageId, format = "full" }) => {
      try {
        const response = await googleFetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=${format}`,
        );
        const msg = await response.json();

        if (!msg.payload) {
          return jsonResponse({
            id: msg.id,
            threadId: msg.threadId,
            labelIds: msg.labelIds,
            snippet: msg.snippet,
            headers: {},
            body: "",
            internalDate: msg.internalDate
              ? new Date(Number.parseInt(msg.internalDate, 10)).toISOString()
              : undefined,
          });
        }

        const headers = Object.fromEntries(
          msg.payload.headers?.map((h: { name: string; value: string }) => [h.name, h.value]) || [],
        );

        return jsonResponse({
          id: msg.id,
          threadId: msg.threadId,
          labelIds: msg.labelIds,
          snippet: msg.snippet,
          headers,
          body: extractBody(msg.payload),
          internalDate: msg.internalDate
            ? new Date(Number.parseInt(msg.internalDate, 10)).toISOString()
            : undefined,
        });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to read email"));
      }
    },
  );

  server.registerTool(
    "calendar_list_events",
    {
      description: "List calendar events. Returns both past and future events when date filters are provided. Without any date filter, defaults to upcoming events only. Supports pagination for large result sets. Convert natural language dates (e.g., 'last week', 'next Monday') to ISO 8601 before calling.",
      inputSchema: {
        maxResults: z.number().int().min(1).max(250).optional().default(10).describe("Max events per page (1-250, default 10)"),
        timeMin: z.string().optional().describe("Only events starting after this time (ISO 8601, e.g. 2026-02-13T00:00:00Z). Omit to default to now (upcoming events)."),
        timeMax: z.string().optional().describe("Only events starting before this time (ISO 8601, e.g. 2026-02-20T23:59:59Z)"),
        calendarId: z.string().optional().default("primary").describe("Calendar ID (default: 'primary')"),
        query: z.string().optional().describe("Free-text search across event fields"),
        pageToken: z.string().optional().describe("Token from a previous response's nextPageToken to fetch the next page"),
      },
    },
    async ({ maxResults = 10, timeMin, timeMax, calendarId = "primary", query, pageToken }) => {
      try {
        if (timeMin && Number.isNaN(new Date(timeMin).getTime())) {
          return errorResponse(`Invalid 'timeMin' date: "${timeMin}". Use ISO 8601 format, e.g. 2026-02-13T00:00:00Z`);
        }
        if (timeMax && Number.isNaN(new Date(timeMax).getTime())) {
          return errorResponse(`Invalid 'timeMax' date: "${timeMax}". Use ISO 8601 format, e.g. 2026-02-20T23:59:59Z`);
        }

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

        const response = await googleFetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
        );
        const data = await response.json();
        const items = data.items || [];

        return jsonResponse({
          resultCount: items.length,
          events: items.map(mapCalendarEvent),
          nextPageToken: data.nextPageToken || null,
        });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to list events"));
      }
    },
  );

  server.registerTool(
    "calendar_create_event",
    {
      description: "Create a new calendar event. Supports timed events, attendees, location, and notification preferences.",
      inputSchema: {
        summary: z.string().min(1).describe("Event title"),
        start: z.string().min(1).describe("Start time (ISO 8601, e.g. 2026-02-20T14:00:00Z)"),
        end: z.string().min(1).describe("End time (ISO 8601, e.g. 2026-02-20T15:00:00Z)"),
        description: z.string().optional().describe("Event description/notes"),
        location: z.string().optional().describe("Event location"),
        attendees: z.array(z.string().email()).optional().describe("Attendee email addresses"),
        calendarId: z.string().optional().default("primary").describe("Calendar ID (default: 'primary')"),
        sendUpdates: z.enum(["all", "externalOnly", "none"]).optional().default("all").describe("Who to send email notifications to"),
      },
    },
    async ({ summary, start, end, description, location, attendees, calendarId = "primary", sendUpdates = "all" }) => {
      try {
        const event: Record<string, unknown> = {
          summary,
          start: { dateTime: start },
          end: { dateTime: end },
          ...(description && { description }),
          ...(location && { location }),
          ...(attendees?.length && { attendees: attendees.map((email) => ({ email })) }),
        };

        const response = await googleFetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=${sendUpdates}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(event),
          },
        );

        const result = await response.json();
        logger.warn("[GoogleMCP] Event created", { eventId: result.id, summary });

        return jsonResponse({
          success: true,
          eventId: result.id,
          htmlLink: result.htmlLink,
          status: result.status,
        });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to create event"));
      }
    },
  );

  server.registerTool(
    "calendar_update_event",
    {
      description: "Update an existing calendar event. Fetches the current event first, then applies your changes. Only provide fields you want to change.",
      inputSchema: {
        eventId: z.string().min(1).describe("Event ID to update"),
        summary: z.string().optional().describe("New event title"),
        start: z.string().optional().describe("New start time (ISO 8601)"),
        end: z.string().optional().describe("New end time (ISO 8601)"),
        description: z.string().optional().describe("New description"),
        location: z.string().optional().describe("New location"),
        calendarId: z.string().optional().default("primary").describe("Calendar ID (default: 'primary')"),
        sendUpdates: z.enum(["all", "externalOnly", "none"]).optional().default("all").describe("Who to send email notifications to"),
      },
    },
    async ({ eventId, summary, start, end, description, location, calendarId = "primary", sendUpdates = "all" }) => {
      try {
        const baseUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;

        const existingResponse = await googleFetch(baseUrl);
        const existing = await existingResponse.json();

        const updated = {
          ...existing,
          ...(summary && { summary }),
          ...(description !== undefined && { description }),
          ...(location !== undefined && { location }),
          ...(start && { start: { ...existing.start, dateTime: start, date: undefined } }),
          ...(end && { end: { ...existing.end, dateTime: end, date: undefined } }),
        };

        const response = await googleFetch(`${baseUrl}?sendUpdates=${sendUpdates}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updated),
        });

        const result = await response.json();
        logger.warn("[GoogleMCP] Event updated", { eventId: result.id });

        return jsonResponse({
          success: true,
          eventId: result.id,
          htmlLink: result.htmlLink,
          updated: result.updated,
        });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to update event"));
      }
    },
  );

  server.registerTool(
    "calendar_delete_event",
    {
      description: "Delete a calendar event. This action cannot be undone.",
      inputSchema: {
        eventId: z.string().min(1).describe("Event ID to delete"),
        calendarId: z.string().optional().default("primary").describe("Calendar ID (default: 'primary')"),
        sendUpdates: z.enum(["all", "externalOnly", "none"]).optional().default("all").describe("Who to send cancellation notifications to"),
      },
    },
    async ({ eventId, calendarId = "primary", sendUpdates = "all" }) => {
      try {
        await googleFetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=${sendUpdates}`,
          { method: "DELETE" },
        );

        logger.warn("[GoogleMCP] Event deleted", { eventId, calendarId });
        return jsonResponse({ success: true, deleted: true, eventId });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to delete event"));
      }
    },
  );

  server.registerTool(
    "contacts_list",
    {
      description: "List or search Google contacts. When a query is provided, uses the Google Contacts search API. Otherwise lists connections. Supports pagination for large contact lists.",
      inputSchema: {
        pageSize: z.number().int().min(1).max(100).optional().default(20).describe("Contacts per page (1-100, default 20)"),
        query: z.string().optional().describe("Search query to find contacts by name, email, phone, or organization"),
        pageToken: z.string().optional().describe("Token from a previous response's nextPageToken to fetch the next page"),
      },
    },
    async ({ pageSize = 20, query, pageToken }) => {
      try {
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

        const response = await googleFetch(`${url}?${params}`);
        const data = await response.json();
        const items = data.connections || data.results || [];

        const result: Record<string, unknown> = {
          resultCount: items.length,
          contacts: items.map(mapContact),
          nextPageToken: data.nextPageToken || null,
        };
        if (query && pageToken) {
          result.note = "Google Contacts search does not support pagination. The pageToken was ignored. To see more results, increase pageSize (max 100).";
        }

        return jsonResponse(result);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to list contacts"));
      }
    },
  );
}

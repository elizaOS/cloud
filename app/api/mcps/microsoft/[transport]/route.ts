/**
 * Microsoft MCP Server - Outlook Mail, Calendar
 *
 * Standalone MCP endpoint for Microsoft tools with per-org OAuth.
 * Config: { "type": "streamable-http", "url": "/api/mcps/microsoft/streamable-http" }
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

async function getMicrosoftMcpHandler() {
  if (mcpHandler) return mcpHandler;

  const { createMcpHandler } = await import("mcp-handler");
  const { z } = await import("zod/v3");

  async function getMicrosoftToken(organizationId: string): Promise<string> {
    const result = await oauthService.getValidTokenByPlatform({ organizationId, platform: "microsoft" });
    return result.accessToken;
  }

  async function graphFetch(orgId: string, url: string, options: RequestInit = {}): Promise<Response> {
    const token = await getMicrosoftToken(orgId);
    const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers } });
    if (!response.ok && response.status !== 204) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `Microsoft Graph API error: ${response.status}`);
    }
    return response;
  }

  function getOrgId(): string {
    const ctx = authContextStorage.getStore();
    if (!ctx) throw new Error("Not authenticated");
    return ctx.user.organization_id;
  }

  function jsonResult(data: object) {
    return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
  }

  function errorResult(msg: string) {
    return { content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }], isError: true };
  }

  mcpHandler = createMcpHandler(
    (server) => {
      server.tool("microsoft_status", "Check Microsoft OAuth connection status", {}, async () => {
        try {
          const orgId = getOrgId();
          const connections = await oauthService.listConnections({ organizationId: orgId, platform: "microsoft" });
          const active = connections.find((c) => c.status === "active");
          return jsonResult(active ? { connected: true, email: active.email, scopes: active.scopes } : { connected: false });
        } catch (e) { return errorResult(e instanceof Error ? e.message : "Failed"); }
      });

      server.tool("outlook_send", "Send email via Outlook", {
        to: z.string().describe("Recipient(s) - comma separated for multiple"),
        subject: z.string().describe("Email subject"),
        body: z.string().describe("Email body"),
        isHtml: z.boolean().optional().default(false),
        cc: z.string().optional().describe("CC recipients"),
        bcc: z.string().optional().describe("BCC recipients"),
      }, async ({ to, subject, body, isHtml = false, cc, bcc }) => {
        try {
          const orgId = getOrgId();
          const message = {
            subject,
            body: { contentType: isHtml ? "HTML" : "Text", content: body },
            toRecipients: to.split(",").map((email) => ({ emailAddress: { address: email.trim() } })),
            ...(cc && { ccRecipients: cc.split(",").map((email) => ({ emailAddress: { address: email.trim() } })) }),
            ...(bcc && { bccRecipients: bcc.split(",").map((email) => ({ emailAddress: { address: email.trim() } })) }),
          };
          const res = await graphFetch(orgId, "https://graph.microsoft.com/v1.0/me/sendMail", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message }),
          });
          logger.info("[MicrosoftMCP] Email sent", { to });
          return jsonResult({ success: true, message: "Email sent successfully" });
        } catch (e) { return errorResult(e instanceof Error ? e.message : "Failed"); }
      });

      server.tool("outlook_list", "List emails from Outlook inbox", {
        folder: z.string().optional().default("inbox").describe("Folder name (inbox, sentitems, drafts, etc.)"),
        top: z.number().int().min(1).max(50).optional().default(10).describe("Number of messages to return"),
        filter: z.string().optional().describe("OData filter query"),
      }, async ({ folder = "inbox", top = 10, filter }) => {
        try {
          const orgId = getOrgId();
          const params = new URLSearchParams({
            $top: String(top),
            $select: "id,subject,from,receivedDateTime,bodyPreview,isRead",
            $orderby: "receivedDateTime desc",
          });
          if (filter) params.set("$filter", filter);
          const res = await graphFetch(orgId, `https://graph.microsoft.com/v1.0/me/mailFolders/${folder}/messages?${params}`);
          const data = await res.json();
          const messages = (data.value || []).map((m: Record<string, unknown>) => ({
            id: m.id,
            subject: m.subject,
            from: (m.from as Record<string, unknown>)?.emailAddress,
            receivedDateTime: m.receivedDateTime,
            preview: m.bodyPreview,
            isRead: m.isRead,
          }));
          return jsonResult({ success: true, messages, count: messages.length });
        } catch (e) { return errorResult(e instanceof Error ? e.message : "Failed"); }
      });

      server.tool("outlook_read", "Read a specific email by ID", {
        messageId: z.string().describe("Message ID"),
      }, async ({ messageId }) => {
        try {
          const orgId = getOrgId();
          const res = await graphFetch(orgId, `https://graph.microsoft.com/v1.0/me/messages/${messageId}`);
          const msg = await res.json();
          return jsonResult({
            success: true,
            id: msg.id,
            subject: msg.subject,
            from: msg.from?.emailAddress,
            to: msg.toRecipients?.map((r: Record<string, unknown>) => r.emailAddress),
            receivedDateTime: msg.receivedDateTime,
            body: msg.body?.content,
            bodyType: msg.body?.contentType,
          });
        } catch (e) { return errorResult(e instanceof Error ? e.message : "Failed"); }
      });

      server.tool("calendar_list_events", "List upcoming calendar events", {
        top: z.number().int().min(1).max(50).optional().default(10),
        startDateTime: z.string().optional().describe("Start time (ISO 8601)"),
        endDateTime: z.string().optional().describe("End time (ISO 8601)"),
      }, async ({ top = 10, startDateTime, endDateTime }) => {
        try {
          const orgId = getOrgId();
          const now = new Date().toISOString();
          const params = new URLSearchParams({
            $top: String(top),
            $select: "id,subject,start,end,location,organizer,attendees",
            $orderby: "start/dateTime",
            startDateTime: startDateTime || now,
            endDateTime: endDateTime || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          });
          const res = await graphFetch(orgId, `https://graph.microsoft.com/v1.0/me/calendarView?${params}`);
          const data = await res.json();
          const events = (data.value || []).map((e: Record<string, unknown>) => ({
            id: e.id,
            subject: e.subject,
            start: (e.start as Record<string, string>)?.dateTime,
            end: (e.end as Record<string, string>)?.dateTime,
            location: (e.location as Record<string, string>)?.displayName,
            organizer: (e.organizer as Record<string, Record<string, string>>)?.emailAddress?.address,
          }));
          return jsonResult({ success: true, events, count: events.length });
        } catch (e) { return errorResult(e instanceof Error ? e.message : "Failed"); }
      });

      server.tool("calendar_create_event", "Create a calendar event", {
        subject: z.string().describe("Event title"),
        start: z.string().describe("Start time (ISO 8601)"),
        end: z.string().describe("End time (ISO 8601)"),
        body: z.string().optional().describe("Event description"),
        location: z.string().optional().describe("Event location"),
        attendees: z.string().optional().describe("Attendee emails (comma separated)"),
      }, async ({ subject, start, end, body, location, attendees }) => {
        try {
          const orgId = getOrgId();
          const event = {
            subject,
            start: { dateTime: start, timeZone: "UTC" },
            end: { dateTime: end, timeZone: "UTC" },
            ...(body && { body: { contentType: "Text", content: body } }),
            ...(location && { location: { displayName: location } }),
            ...(attendees && {
              attendees: attendees.split(",").map((email) => ({
                emailAddress: { address: email.trim() },
                type: "required",
              })),
            }),
          };
          const res = await graphFetch(orgId, "https://graph.microsoft.com/v1.0/me/events", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(event),
          });
          const result = await res.json();
          logger.info("[MicrosoftMCP] Event created", { eventId: result.id });
          return jsonResult({ success: true, eventId: result.id, webLink: result.webLink });
        } catch (e) { return errorResult(e instanceof Error ? e.message : "Failed"); }
      });

      server.tool("calendar_delete_event", "Delete a calendar event", {
        eventId: z.string().describe("Event ID"),
      }, async ({ eventId }) => {
        try {
          const orgId = getOrgId();
          await graphFetch(orgId, `https://graph.microsoft.com/v1.0/me/events/${eventId}`, { method: "DELETE" });
          logger.info("[MicrosoftMCP] Event deleted", { eventId });
          return jsonResult({ success: true, message: "Event deleted" });
        } catch (e) { return errorResult(e instanceof Error ? e.message : "Failed"); }
      });

      server.tool("user_profile", "Get current user profile", {}, async () => {
        try {
          const orgId = getOrgId();
          const res = await graphFetch(orgId, "https://graph.microsoft.com/v1.0/me");
          const profile = await res.json();
          return jsonResult({
            success: true,
            id: profile.id,
            displayName: profile.displayName,
            email: profile.mail || profile.userPrincipalName,
            jobTitle: profile.jobTitle,
            officeLocation: profile.officeLocation,
          });
        } catch (e) { return errorResult(e instanceof Error ? e.message : "Failed"); }
      });
    },
    { capabilities: { tools: {} } },
    { basePath: "/api/mcps/microsoft", maxDuration: 60 },
  );

  return mcpHandler;
}

async function handleRequest(req: NextRequest): Promise<Response> {
  try {
    const authResult = await requireAuthOrApiKeyWithOrg(req);
    const handler = await getMicrosoftMcpHandler();
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
    logger.error(`[MicrosoftMCP] ${msg}`);
    const isAuth = msg.includes("API key") || msg.includes("auth") || msg.includes("Unauthorized");
    return new Response(JSON.stringify({ error: isAuth ? "authentication_required" : "internal_error", message: msg }), { status: isAuth ? 401 : 500, headers: { "Content-Type": "application/json" } });
  }
}

export const GET = handleRequest;
export const POST = handleRequest;
export const DELETE = handleRequest;

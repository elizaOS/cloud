/**
 * Zoom MCP Server - Meetings, Users
 *
 * Standalone MCP endpoint for Zoom tools with per-org OAuth.
 * Config: { "type": "streamable-http", "url": "/api/mcps/zoom/streamable-http" }
 */

import type { NextRequest } from "next/server";
import { logger } from "@/lib/utils/logger";
import { oauthService } from "@/lib/services/oauth";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { authContextStorage } from "@/app/api/mcp/lib/context";
import { checkRateLimitRedis } from "@/lib/middleware/rate-limit-redis";

export const maxDuration = 60;

const ZOOM_API_BASE = "https://api.zoom.us/v2";

interface McpHandlerResponse {
  status: number;
  headers?: Headers;
  text?: () => Promise<string>;
}

function isMcpHandlerResponse(resp: unknown): resp is McpHandlerResponse {
  return typeof resp === "object" && resp !== null && typeof (resp as McpHandlerResponse).status === "number";
}

let mcpHandler: ((req: Request) => Promise<Response>) | null = null;

async function getZoomMcpHandler() {
  if (mcpHandler) return mcpHandler;

  const { createMcpHandler } = await import("mcp-handler");
  const { z } = await import("zod3");

  async function getZoomToken(organizationId: string): Promise<string> {
    const result = await oauthService.getValidTokenByPlatform({ organizationId, platform: "zoom" });
    return result.accessToken;
  }

  function getOrgId(): string {
    const ctx = authContextStorage.getStore();
    if (!ctx) throw new Error("Not authenticated");
    return ctx.user.organization_id;
  }

  async function zoomFetch(orgId: string, path: string, options: RequestInit = {}) {
    const token = await getZoomToken(orgId);
    const url = `${ZOOM_API_BASE}${path}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const msg = error?.message || `Zoom API error: ${response.status}`;
      throw new Error(msg);
    }

    if (response.status === 204) return {};
    const text = await response.text();
    if (!text) return {};
    return JSON.parse(text);
  }

  function jsonResult(data: object) {
    return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
  }

  function errorResult(msg: string) {
    return { content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }], isError: true };
  }

  mcpHandler = createMcpHandler(
    (server) => {
      // --- Connection status ---
      server.tool("zoom_status", "Check Zoom OAuth connection status", {}, async () => {
        try {
          const orgId = getOrgId();
          const connections = await oauthService.listConnections({ organizationId: orgId, platform: "zoom" });
          const active = connections.find((c) => c.status === "active");
          if (!active) return jsonResult({ connected: false });
          return jsonResult({ connected: true, email: active.email, scopes: active.scopes });
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : "Failed");
        }
      });

      // --- Get current user ---
      server.tool(
        "zoom_get_user",
        "Get the current Zoom user's profile information including name, email, and account details",
        {},
        async () => {
          try {
            const orgId = getOrgId();
            const data = await zoomFetch(orgId, "/users/me");
            return jsonResult({
              id: data.id,
              email: data.email,
              firstName: data.first_name,
              lastName: data.last_name,
              displayName: data.display_name,
              type: data.type,
              timezone: data.timezone,
              accountId: data.account_id,
              pmi: data.pmi,
              personalMeetingUrl: data.personal_meeting_url,
            });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed to get user");
          }
        },
      );

      // --- List meetings ---
      server.tool(
        "zoom_list_meetings",
        "List meetings for the current Zoom user. Returns upcoming, past, or all meetings depending on type parameter.",
        {
          type: z.enum(["scheduled", "live", "upcoming", "upcoming_meetings", "previous_meetings"]).optional()
            .describe("Meeting type filter. Default: 'scheduled'. Use 'upcoming' for future meetings, 'previous_meetings' for past ones."),
          page_size: z.number().int().min(1).max(300).optional()
            .describe("Number of meetings per page (default 30, max 300)"),
          next_page_token: z.string().optional()
            .describe("Pagination token from a previous response"),
        },
        async ({ type = "scheduled", page_size = 30, next_page_token }) => {
          try {
            const orgId = getOrgId();
            const params = new URLSearchParams({ type, page_size: String(page_size) });
            if (next_page_token) params.set("next_page_token", next_page_token);

            const data = await zoomFetch(orgId, `/users/me/meetings?${params}`);
            return jsonResult({
              meetings: data.meetings?.map((m: Record<string, unknown>) => ({
                id: m.id,
                uuid: m.uuid,
                topic: m.topic,
                type: m.type,
                startTime: m.start_time,
                duration: m.duration,
                timezone: m.timezone,
                joinUrl: m.join_url,
                status: m.status,
              })),
              totalRecords: data.total_records,
              nextPageToken: data.next_page_token,
            });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed to list meetings");
          }
        },
      );

      // --- Get meeting details ---
      server.tool(
        "zoom_get_meeting",
        "Get detailed information about a specific Zoom meeting including settings, recurrence, and join URL",
        {
          meetingId: z.union([z.string(), z.number()]).describe("The meeting ID to retrieve"),
        },
        async ({ meetingId }) => {
          try {
            const orgId = getOrgId();
            const data = await zoomFetch(orgId, `/meetings/${meetingId}`);
            return jsonResult({
              id: data.id,
              uuid: data.uuid,
              topic: data.topic,
              type: data.type,
              status: data.status,
              startTime: data.start_time,
              duration: data.duration,
              timezone: data.timezone,
              agenda: data.agenda,
              joinUrl: data.join_url,
              startUrl: data.start_url,
              password: data.password,
              hostEmail: data.host_email,
              settings: {
                hostVideo: data.settings?.host_video,
                participantVideo: data.settings?.participant_video,
                joinBeforeHost: data.settings?.join_before_host,
                muteUponEntry: data.settings?.mute_upon_entry,
                waitingRoom: data.settings?.waiting_room,
                autoRecording: data.settings?.auto_recording,
              },
              recurrence: data.recurrence,
            });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed to get meeting");
          }
        },
      );

      // --- Create meeting ---
      server.tool(
        "zoom_create_meeting",
        "Create a new Zoom meeting. Returns the meeting details including join URL and password.",
        {
          topic: z.string().describe("Meeting topic/title"),
          type: z.number().int().min(1).max(8).optional()
            .describe("Meeting type: 1=instant, 2=scheduled (default), 3=recurring no fixed time, 8=recurring fixed time"),
          start_time: z.string().optional()
            .describe("Meeting start time in ISO 8601 format (e.g. 2024-01-15T10:00:00Z). Required for scheduled meetings."),
          duration: z.number().int().optional()
            .describe("Meeting duration in minutes"),
          timezone: z.string().optional()
            .describe("Timezone (e.g. America/New_York, UTC)"),
          agenda: z.string().optional()
            .describe("Meeting description/agenda"),
          password: z.string().optional()
            .describe("Meeting password (max 10 chars)"),
          settings: z.object({
            host_video: z.boolean().optional().describe("Start with host video on"),
            participant_video: z.boolean().optional().describe("Start with participant video on"),
            join_before_host: z.boolean().optional().describe("Allow joining before host"),
            mute_upon_entry: z.boolean().optional().describe("Mute participants on entry"),
            waiting_room: z.boolean().optional().describe("Enable waiting room"),
            auto_recording: z.enum(["local", "cloud", "none"]).optional().describe("Auto recording setting"),
          }).optional().describe("Meeting settings"),
        },
        async ({ topic, type = 2, start_time, duration, timezone, agenda, password, settings }) => {
          try {
            const orgId = getOrgId();
            const body: Record<string, unknown> = { topic, type };
            if (start_time) body.start_time = start_time;
            if (duration) body.duration = duration;
            if (timezone) body.timezone = timezone;
            if (agenda) body.agenda = agenda;
            if (password) body.password = password;
            if (settings) body.settings = settings;

            const data = await zoomFetch(orgId, "/users/me/meetings", {
              method: "POST",
              body: JSON.stringify(body),
            });

            return jsonResult({
              id: data.id,
              uuid: data.uuid,
              topic: data.topic,
              startTime: data.start_time,
              duration: data.duration,
              joinUrl: data.join_url,
              startUrl: data.start_url,
              password: data.password,
              status: data.status,
            });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed to create meeting");
          }
        },
      );

      // --- Update meeting ---
      server.tool(
        "zoom_update_meeting",
        "Update an existing Zoom meeting's details, time, or settings",
        {
          meetingId: z.union([z.string(), z.number()]).describe("The meeting ID to update"),
          topic: z.string().optional().describe("New meeting topic"),
          start_time: z.string().optional().describe("New start time in ISO 8601 format"),
          duration: z.number().int().optional().describe("New duration in minutes"),
          timezone: z.string().optional().describe("New timezone"),
          agenda: z.string().optional().describe("New agenda/description"),
          password: z.string().optional().describe("New password"),
          settings: z.object({
            host_video: z.boolean().optional(),
            participant_video: z.boolean().optional(),
            join_before_host: z.boolean().optional(),
            mute_upon_entry: z.boolean().optional(),
            waiting_room: z.boolean().optional(),
            auto_recording: z.enum(["local", "cloud", "none"]).optional(),
          }).optional().describe("Updated meeting settings"),
        },
        async ({ meetingId, topic, start_time, duration, timezone, agenda, password, settings }) => {
          try {
            const orgId = getOrgId();
            const body: Record<string, unknown> = {};
            if (topic !== undefined) body.topic = topic;
            if (start_time !== undefined) body.start_time = start_time;
            if (duration !== undefined) body.duration = duration;
            if (timezone !== undefined) body.timezone = timezone;
            if (agenda !== undefined) body.agenda = agenda;
            if (password !== undefined) body.password = password;
            if (settings !== undefined) body.settings = settings;

            await zoomFetch(orgId, `/meetings/${meetingId}`, {
              method: "PATCH",
              body: JSON.stringify(body),
            });

            return jsonResult({ success: true, meetingId });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed to update meeting");
          }
        },
      );

      // --- Delete meeting ---
      server.tool(
        "zoom_delete_meeting",
        "Delete a Zoom meeting permanently",
        {
          meetingId: z.union([z.string(), z.number()]).describe("The meeting ID to delete"),
        },
        async ({ meetingId }) => {
          try {
            const orgId = getOrgId();
            await zoomFetch(orgId, `/meetings/${meetingId}`, { method: "DELETE" });
            return jsonResult({ success: true, deleted: meetingId });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed to delete meeting");
          }
        },
      );
    },
    { capabilities: { tools: {} } },
    { basePath: "/api/mcps/zoom", maxDuration: 60 },
  );

  return mcpHandler;
}

async function handleRequest(
  req: NextRequest,
  { params }: { params: Promise<{ transport: string }> },
): Promise<Response> {
  const { transport } = await params;
  if (transport !== "streamable-http") {
    return new Response(
      JSON.stringify({ error: `Transport "${transport}" not supported. Use streamable-http.` }),
      { status: 405, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const authResult = await requireAuthOrApiKeyWithOrg(req);

    const rateLimitKey = `mcp:ratelimit:zoom:${authResult.user.organization_id}`;
    const rateLimit = await checkRateLimitRedis(rateLimitKey, 60000, 100);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ error: "rate_limit_exceeded" }), { status: 429, headers: { "Content-Type": "application/json" } });
    }

    const handler = await getZoomMcpHandler();
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
    logger.error(`[ZoomMCP] ${msg}`);
    const isAuth = msg.includes("API key") || msg.includes("auth") || msg.includes("Unauthorized");
    return new Response(JSON.stringify({ error: isAuth ? "authentication_required" : "internal_error", message: msg }), { status: isAuth ? 401 : 500, headers: { "Content-Type": "application/json" } });
  }
}

export const GET = handleRequest;
export const POST = handleRequest;
export const DELETE = handleRequest;

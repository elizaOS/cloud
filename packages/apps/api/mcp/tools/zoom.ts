// @ts-nocheck — MCP tool types cause exponential type inference
/**
 * Zoom MCP Tools - Meetings, Users
 * Uses per-organization OAuth tokens via oauthService.
 */

import type { McpServer } from "mcp-handler";
import { z } from "zod3";
import { oauthService } from "@/lib/services/oauth";
import { logger } from "@/lib/utils/logger";
import { getAuthContext } from "../lib/context";
import { errorResponse, jsonResponse } from "../lib/responses";

const ZOOM_API_BASE = "https://api.zoom.us/v2";

async function getZoomToken(): Promise<string> {
  const { user } = getAuthContext();
  try {
    const result = await oauthService.getValidTokenByPlatform({
      organizationId: user.organization_id,
      userId: user.id,
      platform: "zoom",
    });
    return result.accessToken;
  } catch (error) {
    logger.warn("[ZoomMCP] Failed to get token", {
      organizationId: user.organization_id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error("Zoom account not connected. Connect in Settings > Connections.");
  }
}

async function zoomFetch(path: string, options: RequestInit = {}) {
  const token = await getZoomToken();
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

function errMsg(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function registerZoomTools(server: McpServer): void {
  // --- Connection status ---
  server.registerTool(
    "zoom_status",
    {
      description: "Check Zoom OAuth connection status",
      inputSchema: {},
    },
    async () => {
      try {
        const { user } = getAuthContext();
        const connections = await oauthService.listConnections({
          organizationId: user.organization_id,
          userId: user.id,
          platform: "zoom",
        });
        const active = connections.find((c) => c.status === "active");
        if (!active) {
          return jsonResponse({
            connected: false,
            message: "Zoom not connected. Connect in Settings > Connections.",
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

  // --- Get current user ---
  server.registerTool(
    "zoom_get_user",
    {
      description:
        "Get the current Zoom user's profile information including name, email, and account details",
      inputSchema: {},
    },
    async () => {
      try {
        const data = await zoomFetch("/users/me");
        return jsonResponse({
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
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to get user"));
      }
    },
  );

  // --- List meetings ---
  server.registerTool(
    "zoom_list_meetings",
    {
      description:
        "List meetings for the current Zoom user. Returns upcoming, past, or all meetings depending on type parameter.",
      inputSchema: {
        type: z
          .enum(["scheduled", "live", "upcoming", "upcoming_meetings", "previous_meetings"])
          .optional()
          .describe(
            "Meeting type filter. Default: 'scheduled'. Use 'upcoming' for future meetings, 'previous_meetings' for past ones.",
          ),
        page_size: z
          .number()
          .int()
          .min(1)
          .max(300)
          .optional()
          .describe("Number of meetings per page (default 30, max 300)"),
        next_page_token: z
          .string()
          .optional()
          .describe("Pagination token from a previous response"),
      },
    },
    async ({ type = "scheduled", page_size = 30, next_page_token }) => {
      try {
        const params = new URLSearchParams({
          type,
          page_size: String(page_size),
        });
        if (next_page_token) params.set("next_page_token", next_page_token);

        const data = await zoomFetch(`/users/me/meetings?${params}`);
        return jsonResponse({
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
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to list meetings"));
      }
    },
  );

  // --- Get meeting details ---
  server.registerTool(
    "zoom_get_meeting",
    {
      description:
        "Get detailed information about a specific Zoom meeting including settings, recurrence, and join URL",
      inputSchema: {
        meetingId: z.union([z.string(), z.number()]).describe("The meeting ID to retrieve"),
      },
    },
    async ({ meetingId }) => {
      try {
        const data = await zoomFetch(`/meetings/${meetingId}`);
        return jsonResponse({
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
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to get meeting"));
      }
    },
  );

  // --- Create meeting ---
  server.registerTool(
    "zoom_create_meeting",
    {
      description:
        "Create a new Zoom meeting. Returns the meeting details including join URL and password.",
      inputSchema: {
        topic: z.string().describe("Meeting topic/title"),
        type: z
          .number()
          .int()
          .min(1)
          .max(8)
          .optional()
          .describe(
            "Meeting type: 1=instant, 2=scheduled (default), 3=recurring no fixed time, 8=recurring fixed time",
          ),
        start_time: z
          .string()
          .optional()
          .describe(
            "Meeting start time in ISO 8601 format (e.g. 2024-01-15T10:00:00Z). Required for scheduled meetings.",
          ),
        duration: z.number().int().optional().describe("Meeting duration in minutes"),
        timezone: z.string().optional().describe("Timezone (e.g. America/New_York, UTC)"),
        agenda: z.string().optional().describe("Meeting description/agenda"),
        password: z.string().optional().describe("Meeting password (max 10 chars)"),
        settings: z
          .object({
            host_video: z.boolean().optional().describe("Start with host video on"),
            participant_video: z.boolean().optional().describe("Start with participant video on"),
            join_before_host: z.boolean().optional().describe("Allow joining before host"),
            mute_upon_entry: z.boolean().optional().describe("Mute participants on entry"),
            waiting_room: z.boolean().optional().describe("Enable waiting room"),
            auto_recording: z
              .enum(["local", "cloud", "none"])
              .optional()
              .describe("Auto recording setting"),
          })
          .optional()
          .describe("Meeting settings"),
      },
    },
    async ({ topic, type = 2, start_time, duration, timezone, agenda, password, settings }) => {
      try {
        const body: Record<string, unknown> = { topic, type };
        if (start_time) body.start_time = start_time;
        if (duration) body.duration = duration;
        if (timezone) body.timezone = timezone;
        if (agenda) body.agenda = agenda;
        if (password) body.password = password;
        if (settings) body.settings = settings;

        const data = await zoomFetch("/users/me/meetings", {
          method: "POST",
          body: JSON.stringify(body),
        });

        logger.info("[ZoomMCP] Meeting created", { meetingId: data.id, topic });

        return jsonResponse({
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
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to create meeting"));
      }
    },
  );

  // --- Update meeting ---
  server.registerTool(
    "zoom_update_meeting",
    {
      description: "Update an existing Zoom meeting's details, time, or settings",
      inputSchema: {
        meetingId: z.union([z.string(), z.number()]).describe("The meeting ID to update"),
        topic: z.string().optional().describe("New meeting topic"),
        start_time: z.string().optional().describe("New start time in ISO 8601 format"),
        duration: z.number().int().optional().describe("New duration in minutes"),
        timezone: z.string().optional().describe("New timezone"),
        agenda: z.string().optional().describe("New agenda/description"),
        password: z.string().optional().describe("New password"),
        settings: z
          .object({
            host_video: z.boolean().optional(),
            participant_video: z.boolean().optional(),
            join_before_host: z.boolean().optional(),
            mute_upon_entry: z.boolean().optional(),
            waiting_room: z.boolean().optional(),
            auto_recording: z.enum(["local", "cloud", "none"]).optional(),
          })
          .optional()
          .describe("Updated meeting settings"),
      },
    },
    async ({ meetingId, topic, start_time, duration, timezone, agenda, password, settings }) => {
      try {
        const body: Record<string, unknown> = {};
        if (topic !== undefined) body.topic = topic;
        if (start_time !== undefined) body.start_time = start_time;
        if (duration !== undefined) body.duration = duration;
        if (timezone !== undefined) body.timezone = timezone;
        if (agenda !== undefined) body.agenda = agenda;
        if (password !== undefined) body.password = password;
        if (settings !== undefined) body.settings = settings;

        await zoomFetch(`/meetings/${meetingId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });

        return jsonResponse({ success: true, meetingId });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to update meeting"));
      }
    },
  );

  // --- Delete meeting ---
  server.registerTool(
    "zoom_delete_meeting",
    {
      description: "Delete a Zoom meeting permanently",
      inputSchema: {
        meetingId: z.union([z.string(), z.number()]).describe("The meeting ID to delete"),
      },
    },
    async ({ meetingId }) => {
      try {
        await zoomFetch(`/meetings/${meetingId}`, { method: "DELETE" });
        return jsonResponse({ success: true, deleted: meetingId });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to delete meeting"));
      }
    },
  );
}

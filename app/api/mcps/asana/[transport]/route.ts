// @ts-nocheck — MCP tool types cause exponential type inference
/**
 * Asana MCP Server - Tasks, Projects, Workspaces, Comments
 *
 * Standalone MCP endpoint for Asana tools with per-org OAuth.
 * Config: { "type": "streamable-http", "url": "/api/mcps/asana/streamable-http" }
 *
 * Asana API 1.0:
 * - Base URL: https://app.asana.com/api/1.0
 * - Auth: Bearer token
 * - Responses wrapped in { data: ... } envelope
 * - Pagination via next_page.offset
 */

import type { NextRequest } from "next/server";
import { authContextStorage } from "@/app/api/mcp/lib/context";
import { apiFailureResponse } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { enforceMcpOrganizationRateLimit } from "@/lib/middleware/rate-limit";
import { oauthService } from "@/lib/services/oauth";
import { logger } from "@/lib/utils/logger";

export const maxDuration = 60;

interface McpHandlerResponse {
  status: number;
  headers?: Headers;
  text?: () => Promise<string>;
}

function isMcpHandlerResponse(resp: unknown): resp is McpHandlerResponse {
  return (
    typeof resp === "object" &&
    resp !== null &&
    typeof (resp as McpHandlerResponse).status === "number"
  );
}

let mcpHandler: ((req: Request) => Promise<Response>) | null = null;

async function getAsanaMcpHandler() {
  if (mcpHandler) return mcpHandler;

  const { createMcpHandler } = await import("mcp-handler");
  const { z } = await import("zod3");

  const API_BASE = "https://app.asana.com/api/1.0";

  async function getAsanaToken(organizationId: string): Promise<string> {
    const user = getAuthUser();
    const result = await oauthService.getValidTokenByPlatform({
      organizationId,
      userId: user.id,
      platform: "asana",
    });
    return result.accessToken;
  }

  async function asanaApi(
    orgId: string,
    method: string,
    path: string,
    body?: unknown,
  ) {
    const token = await getAsanaToken(orgId);
    const url = `${API_BASE}${path}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };
    if (body) headers["Content-Type"] = "application/json";

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("[AsanaMCP] API error", {
        method,
        url,
        status: response.status,
        errorBody: errorText.substring(0, 500),
      });
      let parsed: { errors?: { message: string }[] } = {};
      try {
        parsed = JSON.parse(errorText);
      } catch {}
      throw new Error(
        parsed?.errors?.[0]?.message || `Asana API error: ${response.status}`,
      );
    }

    if (response.status === 204) return { success: true };
    return response.json();
  }

  function getOrgId(): string {
    const ctx = authContextStorage.getStore();
    if (!ctx) throw new Error("Not authenticated");
    return ctx.user.organization_id;
  }

  function getAuthUser() {
    const ctx = authContextStorage.getStore();
    if (!ctx) throw new Error("Not authenticated");
    return ctx.user;
  }

  function jsonResult(data: object) {
    return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
  }

  function errorResult(msg: string) {
    return {
      content: [
        { type: "text" as const, text: JSON.stringify({ error: msg }) },
      ],
      isError: true,
    };
  }

  mcpHandler = createMcpHandler(
    (server) => {
      // --- Connection Status ---
      server.tool(
        "asana_status",
        "Check Asana OAuth connection status",
        {},
        async () => {
          try {
            const orgId = getOrgId();
            const connections = await oauthService.listConnections({
              organizationId: orgId,
              userId: getAuthUser().id,
              platform: "asana",
            });
            const active = connections.find((c) => c.status === "active");
            return jsonResult(
              active
                ? {
                    connected: true,
                    email: active.email,
                    scopes: active.scopes,
                  }
                : { connected: false },
            );
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      // --- Current User ---
      server.tool(
        "asana_get_myself",
        "Get the currently authenticated Asana user",
        {},
        async () => {
          try {
            const orgId = getOrgId();
            const data = await asanaApi(
              orgId,
              "GET",
              "/users/me?opt_fields=gid,name,email,photo,workspaces,workspaces.name",
            );
            return jsonResult(data);
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      // --- Workspaces ---
      server.tool(
        "asana_list_workspaces",
        "List Asana workspaces accessible to the user",
        {
          limit: z
            .number()
            .int()
            .min(1)
            .max(100)
            .optional()
            .describe("Max results (default 100)"),
        },
        async ({ limit }) => {
          try {
            const orgId = getOrgId();
            const params = new URLSearchParams({
              opt_fields: "gid,name,is_organization",
            });
            if (limit) params.set("limit", String(limit));
            const data = await asanaApi(
              orgId,
              "GET",
              `/workspaces?${params.toString()}`,
            );
            return jsonResult(data);
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      // --- Projects ---
      server.tool(
        "asana_list_projects",
        "List projects in an Asana workspace",
        {
          workspaceGid: z.string().min(1).describe("Workspace GID"),
          archived: z
            .boolean()
            .optional()
            .describe("Include archived projects (default false)"),
          limit: z
            .number()
            .int()
            .min(1)
            .max(100)
            .optional()
            .describe("Max results"),
        },
        async ({ workspaceGid, archived, limit }) => {
          try {
            const orgId = getOrgId();
            const params = new URLSearchParams({
              opt_fields:
                "gid,name,color,created_at,modified_at,owner,team,archived",
            });
            if (archived !== undefined)
              params.set("archived", String(archived));
            if (limit) params.set("limit", String(limit));
            const data = await asanaApi(
              orgId,
              "GET",
              `/workspaces/${workspaceGid}/projects?${params.toString()}`,
            );
            return jsonResult(data);
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      server.tool(
        "asana_get_project",
        "Get Asana project details",
        { projectGid: z.string().min(1).describe("Project GID") },
        async ({ projectGid }) => {
          try {
            const orgId = getOrgId();
            const data = await asanaApi(
              orgId,
              "GET",
              `/projects/${projectGid}?opt_fields=gid,name,notes,color,created_at,modified_at,owner,team,members,due_on,start_on,archived,permalink_url`,
            );
            return jsonResult(data);
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      // --- Tasks ---
      server.tool(
        "asana_list_tasks",
        "List tasks in an Asana project",
        {
          projectGid: z.string().min(1).describe("Project GID"),
          limit: z
            .number()
            .int()
            .min(1)
            .max(100)
            .optional()
            .describe("Max results"),
          offset: z.string().optional().describe("Pagination offset token"),
        },
        async ({ projectGid, limit, offset }) => {
          try {
            const orgId = getOrgId();
            const params = new URLSearchParams({
              opt_fields:
                "gid,name,assignee,assignee.name,completed,due_on,created_at,modified_at,notes",
            });
            if (limit) params.set("limit", String(limit));
            if (offset) params.set("offset", offset);
            const data = await asanaApi(
              orgId,
              "GET",
              `/projects/${projectGid}/tasks?${params.toString()}`,
            );
            return jsonResult(data);
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      server.tool(
        "asana_get_task",
        "Get an Asana task by GID",
        { taskGid: z.string().min(1).describe("Task GID") },
        async ({ taskGid }) => {
          try {
            const orgId = getOrgId();
            const data = await asanaApi(
              orgId,
              "GET",
              `/tasks/${taskGid}?opt_fields=gid,name,notes,assignee,assignee.name,assignee.email,completed,completed_at,due_on,due_at,start_on,created_at,modified_at,projects,projects.name,tags,tags.name,parent,parent.name,permalink_url`,
            );
            return jsonResult(data);
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      server.tool(
        "asana_create_task",
        "Create a new Asana task",
        {
          name: z.string().min(1).describe("Task name/title"),
          workspaceGid: z
            .string()
            .optional()
            .describe("Workspace GID (required if no projectGid)"),
          projectGid: z
            .string()
            .optional()
            .describe("Project GID to add the task to"),
          notes: z.string().optional().describe("Task description"),
          assignee: z.string().optional().describe("Assignee GID or email"),
          dueOn: z.string().optional().describe("Due date (YYYY-MM-DD)"),
          startOn: z.string().optional().describe("Start date (YYYY-MM-DD)"),
          parentGid: z
            .string()
            .optional()
            .describe("Parent task GID (for subtasks)"),
        },
        async ({
          name,
          workspaceGid,
          projectGid,
          notes,
          assignee,
          dueOn,
          startOn,
          parentGid,
        }) => {
          try {
            const orgId = getOrgId();
            const taskData: Record<string, unknown> = { name };
            if (workspaceGid) taskData.workspace = workspaceGid;
            if (projectGid) taskData.projects = [projectGid];
            if (notes) taskData.notes = notes;
            if (assignee) taskData.assignee = assignee;
            if (dueOn) taskData.due_on = dueOn;
            if (startOn) taskData.start_on = startOn;
            if (parentGid) taskData.parent = parentGid;
            const data = await asanaApi(orgId, "POST", "/tasks", {
              data: taskData,
            });
            return jsonResult(data);
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      server.tool(
        "asana_update_task",
        "Update an existing Asana task",
        {
          taskGid: z.string().min(1).describe("Task GID"),
          name: z.string().optional().describe("New task name"),
          notes: z.string().optional().describe("New description"),
          assignee: z.string().optional().describe("New assignee GID or email"),
          dueOn: z.string().optional().describe("New due date (YYYY-MM-DD)"),
          startOn: z
            .string()
            .optional()
            .describe("New start date (YYYY-MM-DD)"),
          completed: z.boolean().optional().describe("Mark task as completed"),
        },
        async ({
          taskGid,
          name,
          notes,
          assignee,
          dueOn,
          startOn,
          completed,
        }) => {
          try {
            const orgId = getOrgId();
            const taskData: Record<string, unknown> = {};
            if (name !== undefined) taskData.name = name;
            if (notes !== undefined) taskData.notes = notes;
            if (assignee !== undefined) taskData.assignee = assignee;
            if (dueOn !== undefined) taskData.due_on = dueOn;
            if (startOn !== undefined) taskData.start_on = startOn;
            if (completed !== undefined) taskData.completed = completed;
            const data = await asanaApi(orgId, "PUT", `/tasks/${taskGid}`, {
              data: taskData,
            });
            return jsonResult(data);
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      server.tool(
        "asana_search_tasks",
        "Search tasks in an Asana workspace. Note: search results may have a 10-60 second indexing delay.",
        {
          workspaceGid: z.string().min(1).describe("Workspace GID"),
          text: z.string().optional().describe("Free text search"),
          assignee: z
            .string()
            .optional()
            .describe("Assignee GID (use 'me' for current user)"),
          projectGid: z.string().optional().describe("Filter by project GID"),
          completed: z
            .boolean()
            .optional()
            .describe("Filter by completion status"),
          sortBy: z
            .string()
            .optional()
            .describe(
              "Sort by: created_at, completed_at, modified_at, due_date, likes",
            ),
          sortAscending: z
            .boolean()
            .optional()
            .describe("Sort ascending (default false)"),
          limit: z
            .number()
            .int()
            .min(1)
            .max(100)
            .optional()
            .describe("Max results"),
        },
        async ({
          workspaceGid,
          text,
          assignee,
          projectGid,
          completed,
          sortBy,
          sortAscending,
          limit,
        }) => {
          try {
            const orgId = getOrgId();
            const params = new URLSearchParams({
              opt_fields:
                "gid,name,assignee,assignee.name,completed,due_on,created_at,modified_at,permalink_url",
            });
            if (text) params.set("text", text);
            if (assignee) params.set("assignee.any", assignee);
            if (projectGid) params.set("projects.any", projectGid);
            if (completed !== undefined)
              params.set("completed", String(completed));
            if (sortBy) params.set("sort_by", sortBy);
            if (sortAscending !== undefined)
              params.set("sort_ascending", String(sortAscending));
            if (limit) params.set("limit", String(limit));
            const data = await asanaApi(
              orgId,
              "GET",
              `/workspaces/${workspaceGid}/tasks/search?${params.toString()}`,
            );
            return jsonResult(data);
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      // --- Comments/Stories ---
      server.tool(
        "asana_add_comment",
        "Add a comment to an Asana task",
        {
          taskGid: z.string().min(1).describe("Task GID"),
          text: z.string().min(1).describe("Comment text"),
        },
        async ({ taskGid, text }) => {
          try {
            const orgId = getOrgId();
            const data = await asanaApi(
              orgId,
              "POST",
              `/tasks/${taskGid}/stories`,
              {
                data: { text },
              },
            );
            return jsonResult(data);
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      server.tool(
        "asana_list_comments",
        "List comments on an Asana task",
        {
          taskGid: z.string().min(1).describe("Task GID"),
          limit: z
            .number()
            .int()
            .min(1)
            .max(100)
            .optional()
            .describe("Max results"),
        },
        async ({ taskGid, limit }) => {
          try {
            const orgId = getOrgId();
            const params = new URLSearchParams({
              opt_fields:
                "gid,text,created_at,created_by,created_by.name,resource_subtype",
            });
            if (limit) params.set("limit", String(limit));
            const data = await asanaApi(
              orgId,
              "GET",
              `/tasks/${taskGid}/stories?${params.toString()}`,
            );
            return jsonResult(data);
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      // --- Sections ---
      server.tool(
        "asana_list_sections",
        "List sections in an Asana project",
        {
          projectGid: z.string().min(1).describe("Project GID"),
          limit: z
            .number()
            .int()
            .min(1)
            .max(100)
            .optional()
            .describe("Max results"),
        },
        async ({ projectGid, limit }) => {
          try {
            const orgId = getOrgId();
            const params = new URLSearchParams({
              opt_fields: "gid,name,created_at",
            });
            if (limit) params.set("limit", String(limit));
            const data = await asanaApi(
              orgId,
              "GET",
              `/projects/${projectGid}/sections?${params.toString()}`,
            );
            return jsonResult(data);
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      // --- Users ---
      server.tool(
        "asana_list_users",
        "List users in an Asana workspace",
        {
          workspaceGid: z.string().min(1).describe("Workspace GID"),
          limit: z
            .number()
            .int()
            .min(1)
            .max(100)
            .optional()
            .describe("Max results"),
        },
        async ({ workspaceGid, limit }) => {
          try {
            const orgId = getOrgId();
            const params = new URLSearchParams({
              opt_fields: "gid,name,email,photo",
            });
            if (limit) params.set("limit", String(limit));
            const data = await asanaApi(
              orgId,
              "GET",
              `/workspaces/${workspaceGid}/users?${params.toString()}`,
            );
            return jsonResult(data);
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );
    },
    { capabilities: { tools: {} } },
    {
      streamableHttpEndpoint: "/api/mcps/asana/streamable-http",
      disableSse: true,
      maxDuration: 60,
    },
  );

  return mcpHandler;
}

async function handleRequest(req: NextRequest): Promise<Response> {
  try {
    const authResult = await requireAuthOrApiKeyWithOrg(req);

    const rateLimited = await enforceMcpOrganizationRateLimit(
      authResult.user.organization_id!,
      "asana",
    );
    if (rateLimited) return rateLimited;

    const handler = await getAsanaMcpHandler();
    const mcpResponse = await authContextStorage.run(authResult, () =>
      handler(req as Request),
    );

    if (!mcpResponse || !isMcpHandlerResponse(mcpResponse)) {
      return new Response(JSON.stringify({ error: "invalid_response" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const bodyText = mcpResponse.text ? await mcpResponse.text() : "";
    const headers: Record<string, string> = {};
    mcpResponse.headers?.forEach((v: string, k: string) => {
      headers[k] = v;
    });

    return new Response(bodyText, { status: mcpResponse.status, headers });
  } catch (error) {
    logger.error("[AsanaMCP]", error);
    return apiFailureResponse(error);
  }
}

async function withTransportValidation(
  req: NextRequest,
  { params }: { params: Promise<{ transport: string }> },
): Promise<Response> {
  const { transport } = await params;
  if (transport !== "streamable-http") {
    return new Response(
      JSON.stringify({
        error: `Transport "${transport}" not supported. Use streamable-http.`,
      }),
      { status: 405, headers: { "Content-Type": "application/json" } },
    );
  }
  return handleRequest(req);
}

export const GET = withTransportValidation;
export const POST = withTransportValidation;
export const DELETE = withTransportValidation;

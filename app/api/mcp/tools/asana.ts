// @ts-nocheck — MCP tool types cause exponential type inference
/**
 * Asana MCP Tools - Tasks, Projects, Workspaces, Comments
 * Uses per-organization OAuth tokens via oauthService.
 *
 * Asana API 1.0:
 * - Base URL: https://app.asana.com/api/1.0
 * - Auth: Bearer token
 * - Responses wrapped in { data: ... } envelope
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod3";
import { oauthService } from "@/lib/services/oauth";
import { logger } from "@/lib/utils/logger";
import { getAuthContext } from "../lib/context";
import { errorResponse, jsonResponse } from "../lib/responses";

const API_BASE = "https://app.asana.com/api/1.0";

async function getAsanaToken(): Promise<string> {
  const { user } = getAuthContext();
  try {
    const result = await oauthService.getValidTokenByPlatform({
      organizationId: user.organization_id,
      userId: user.id,
      platform: "asana",
    });
    return result.accessToken;
  } catch (error) {
    logger.warn("[AsanaMCP] Failed to get token", {
      organizationId: user.organization_id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(
      "Asana account not connected. Connect in Settings > Connections.",
    );
  }
}

async function asanaApi(method: string, path: string, body?: unknown) {
  const token = await getAsanaToken();
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

function errMsg(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function registerAsanaTools(server: McpServer): void {
  server.registerTool(
    "asana_status",
    { description: "Check Asana OAuth connection status", inputSchema: {} },
    async () => {
      try {
        const { user } = getAuthContext();
        const connections = await oauthService.listConnections({
          organizationId: user.organization_id,
          userId: user.id,
          platform: "asana",
        });
        const active = connections.find((c) => c.status === "active");
        if (!active) {
          return jsonResponse({
            connected: false,
            message: "Asana not connected. Connect in Settings > Connections.",
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
    "asana_get_myself",
    {
      description: "Get the currently authenticated Asana user",
      inputSchema: {},
    },
    async () => {
      try {
        const data = await asanaApi(
          "GET",
          "/users/me?opt_fields=gid,name,email,photo,workspaces,workspaces.name",
        );
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to get current user"));
      }
    },
  );

  server.registerTool(
    "asana_list_workspaces",
    {
      description: "List Asana workspaces accessible to the user",
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Max results (default 100)"),
      },
    },
    async ({ limit }) => {
      try {
        const params = new URLSearchParams({
          opt_fields: "gid,name,is_organization",
        });
        if (limit) params.set("limit", String(limit));
        const data = await asanaApi("GET", `/workspaces?${params.toString()}`);
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to list workspaces"));
      }
    },
  );

  server.registerTool(
    "asana_list_projects",
    {
      description: "List projects in an Asana workspace",
      inputSchema: {
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
    },
    async ({ workspaceGid, archived, limit }) => {
      try {
        const params = new URLSearchParams({
          opt_fields:
            "gid,name,color,created_at,modified_at,owner,team,archived",
        });
        if (archived !== undefined) params.set("archived", String(archived));
        if (limit) params.set("limit", String(limit));
        const data = await asanaApi(
          "GET",
          `/workspaces/${workspaceGid}/projects?${params.toString()}`,
        );
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to list projects"));
      }
    },
  );

  server.registerTool(
    "asana_get_project",
    {
      description: "Get Asana project details",
      inputSchema: { projectGid: z.string().min(1).describe("Project GID") },
    },
    async ({ projectGid }) => {
      try {
        const data = await asanaApi(
          "GET",
          `/projects/${projectGid}?opt_fields=gid,name,notes,color,created_at,modified_at,owner,team,members,due_on,start_on,archived,permalink_url`,
        );
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to get project"));
      }
    },
  );

  server.registerTool(
    "asana_list_tasks",
    {
      description: "List tasks in an Asana project",
      inputSchema: {
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
    },
    async ({ projectGid, limit, offset }) => {
      try {
        const params = new URLSearchParams({
          opt_fields:
            "gid,name,assignee,assignee.name,completed,due_on,created_at,modified_at,notes",
        });
        if (limit) params.set("limit", String(limit));
        if (offset) params.set("offset", offset);
        const data = await asanaApi(
          "GET",
          `/projects/${projectGid}/tasks?${params.toString()}`,
        );
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to list tasks"));
      }
    },
  );

  server.registerTool(
    "asana_get_task",
    {
      description: "Get an Asana task by GID",
      inputSchema: { taskGid: z.string().min(1).describe("Task GID") },
    },
    async ({ taskGid }) => {
      try {
        const data = await asanaApi(
          "GET",
          `/tasks/${taskGid}?opt_fields=gid,name,notes,assignee,assignee.name,assignee.email,completed,completed_at,due_on,due_at,start_on,created_at,modified_at,projects,projects.name,tags,tags.name,parent,parent.name,permalink_url`,
        );
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to get task"));
      }
    },
  );

  server.registerTool(
    "asana_create_task",
    {
      description: "Create a new Asana task",
      inputSchema: {
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
        const taskData: Record<string, unknown> = { name };
        if (workspaceGid) taskData.workspace = workspaceGid;
        if (projectGid) taskData.projects = [projectGid];
        if (notes) taskData.notes = notes;
        if (assignee) taskData.assignee = assignee;
        if (dueOn) taskData.due_on = dueOn;
        if (startOn) taskData.start_on = startOn;
        if (parentGid) taskData.parent = parentGid;
        const data = await asanaApi("POST", "/tasks", { data: taskData });
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to create task"));
      }
    },
  );

  server.registerTool(
    "asana_update_task",
    {
      description: "Update an existing Asana task",
      inputSchema: {
        taskGid: z.string().min(1).describe("Task GID"),
        name: z.string().optional().describe("New task name"),
        notes: z.string().optional().describe("New description"),
        assignee: z.string().optional().describe("New assignee GID or email"),
        dueOn: z.string().optional().describe("New due date (YYYY-MM-DD)"),
        startOn: z.string().optional().describe("New start date (YYYY-MM-DD)"),
        completed: z.boolean().optional().describe("Mark task as completed"),
      },
    },
    async ({ taskGid, name, notes, assignee, dueOn, startOn, completed }) => {
      try {
        const taskData: Record<string, unknown> = {};
        if (name !== undefined) taskData.name = name;
        if (notes !== undefined) taskData.notes = notes;
        if (assignee !== undefined) taskData.assignee = assignee;
        if (dueOn !== undefined) taskData.due_on = dueOn;
        if (startOn !== undefined) taskData.start_on = startOn;
        if (completed !== undefined) taskData.completed = completed;
        const data = await asanaApi("PUT", `/tasks/${taskGid}`, {
          data: taskData,
        });
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to update task"));
      }
    },
  );

  server.registerTool(
    "asana_search_tasks",
    {
      description:
        "Search tasks in an Asana workspace. Note: search results may have a 10-60 second indexing delay.",
      inputSchema: {
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
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Max results"),
      },
    },
    async ({
      workspaceGid,
      text,
      assignee,
      projectGid,
      completed,
      sortBy,
      limit,
    }) => {
      try {
        const params = new URLSearchParams({
          opt_fields:
            "gid,name,assignee,assignee.name,completed,due_on,created_at,modified_at,permalink_url",
        });
        if (text) params.set("text", text);
        if (assignee) params.set("assignee.any", assignee);
        if (projectGid) params.set("projects.any", projectGid);
        if (completed !== undefined) params.set("completed", String(completed));
        if (sortBy) params.set("sort_by", sortBy);
        if (limit) params.set("limit", String(limit));
        const data = await asanaApi(
          "GET",
          `/workspaces/${workspaceGid}/tasks/search?${params.toString()}`,
        );
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to search tasks"));
      }
    },
  );

  server.registerTool(
    "asana_add_comment",
    {
      description: "Add a comment to an Asana task",
      inputSchema: {
        taskGid: z.string().min(1).describe("Task GID"),
        text: z.string().min(1).describe("Comment text"),
      },
    },
    async ({ taskGid, text }) => {
      try {
        const data = await asanaApi("POST", `/tasks/${taskGid}/stories`, {
          data: { text },
        });
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to add comment"));
      }
    },
  );

  server.registerTool(
    "asana_list_comments",
    {
      description: "List comments on an Asana task",
      inputSchema: {
        taskGid: z.string().min(1).describe("Task GID"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Max results"),
      },
    },
    async ({ taskGid, limit }) => {
      try {
        const params = new URLSearchParams({
          opt_fields:
            "gid,text,created_at,created_by,created_by.name,resource_subtype",
        });
        if (limit) params.set("limit", String(limit));
        const data = await asanaApi(
          "GET",
          `/tasks/${taskGid}/stories?${params.toString()}`,
        );
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to list comments"));
      }
    },
  );

  server.registerTool(
    "asana_list_sections",
    {
      description: "List sections in an Asana project",
      inputSchema: {
        projectGid: z.string().min(1).describe("Project GID"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Max results"),
      },
    },
    async ({ projectGid, limit }) => {
      try {
        const params = new URLSearchParams({
          opt_fields: "gid,name,created_at",
        });
        if (limit) params.set("limit", String(limit));
        const data = await asanaApi(
          "GET",
          `/projects/${projectGid}/sections?${params.toString()}`,
        );
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to list sections"));
      }
    },
  );

  server.registerTool(
    "asana_list_users",
    {
      description: "List users in an Asana workspace",
      inputSchema: {
        workspaceGid: z.string().min(1).describe("Workspace GID"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Max results"),
      },
    },
    async ({ workspaceGid, limit }) => {
      try {
        const params = new URLSearchParams({
          opt_fields: "gid,name,email,photo",
        });
        if (limit) params.set("limit", String(limit));
        const data = await asanaApi(
          "GET",
          `/workspaces/${workspaceGid}/users?${params.toString()}`,
        );
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to list users"));
      }
    },
  );
}

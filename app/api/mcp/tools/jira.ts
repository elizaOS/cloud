// @ts-nocheck — MCP tool types cause exponential type inference
/**
 * Jira MCP Tools - Issues, Projects, Comments, Transitions
 * Uses per-organization OAuth tokens via oauthService.
 *
 * Jira API v3 requires:
 * - Cloud ID resolution via accessible-resources endpoint
 * - ADF (Atlassian Document Format) for rich text fields
 */

import type { McpServer } from "mcp-handler";
import { z } from "zod3";
import { logger } from "@/lib/utils/logger";
import { oauthService } from "@/lib/services/oauth";
import { getAuthContext } from "../lib/context";
import { jsonResponse, errorResponse } from "../lib/responses";

async function getJiraToken(): Promise<string> {
  const { user } = getAuthContext();
  try {
    const result = await oauthService.getValidTokenByPlatform({
      organizationId: user.organization_id,
      platform: "jira",
    });
    return result.accessToken;
  } catch (error) {
    logger.warn("[JiraMCP] Failed to get token", {
      organizationId: user.organization_id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error("Jira account not connected. Connect in Settings > Connections.");
  }
}

// Cache cloud IDs per-org (30 min TTL)
const cloudIdCache = new Map<string, { id: string; expiresAt: number }>();
const CLOUD_ID_TTL_MS = 30 * 60 * 1000;

async function getCloudId(token: string, orgId: string): Promise<string> {
  const cached = cloudIdCache.get(orgId);
  if (cached && cached.expiresAt > Date.now()) return cached.id;

  const response = await fetch("https://api.atlassian.com/oauth/token/accessible-resources", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Failed to get Jira accessible resources: ${response.status}`);
  }
  const resources = await response.json();
  if (!Array.isArray(resources) || resources.length === 0) {
    throw new Error("No Jira sites found. Ensure your Atlassian account has access to a Jira Cloud site.");
  }

  const cloudId = resources[0].id;
  cloudIdCache.set(orgId, { id: cloudId, expiresAt: Date.now() + CLOUD_ID_TTL_MS });
  return cloudId;
}

async function jiraApi(method: string, path: string, body?: unknown) {
  const { user } = getAuthContext();
  const token = await getJiraToken();
  const cloudId = await getCloudId(token, user.organization_id);
  const url = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3${path}`;

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
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error?.errorMessages?.join("; ") ||
      error?.message ||
      `Jira API error: ${response.status}`,
    );
  }

  if (response.status === 204) return { success: true };

  const text = await response.text();
  if (!text || !text.trim()) return { success: true };
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Jira API returned invalid JSON: ${text.slice(0, 200)}`);
  }
}

/** Convert plain text to ADF (Atlassian Document Format) */
function textToAdf(text: string) {
  return {
    type: "doc",
    version: 1,
    content: text.split("\n\n").map((paragraph) => ({
      type: "paragraph",
      content: [{ type: "text", text: paragraph }],
    })),
  };
}

function errMsg(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function registerJiraTools(server: McpServer): void {
  server.registerTool(
    "jira_status",
    {
      description: "Check Jira OAuth connection status",
      inputSchema: {},
    },
    async () => {
      try {
        const { user } = getAuthContext();
        const connections = await oauthService.listConnections({
          organizationId: user.organization_id,
          platform: "jira",
        });
        const active = connections.find((c) => c.status === "active");
        if (!active) {
          return jsonResponse({
            connected: false,
            message: "Jira not connected. Connect in Settings > Connections.",
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
    "jira_search_issues",
    {
      description: "Search Jira issues using JQL (Jira Query Language). Example JQL: 'project = KEY AND status = \"In Progress\" ORDER BY created DESC'",
      inputSchema: {
        jql: z.string().min(1).describe("JQL query string"),
        maxResults: z.number().int().min(1).max(100).optional().describe("Max results (default 50)"),
        startAt: z.number().int().min(0).optional().describe("Pagination offset"),
        fields: z.array(z.string()).optional().describe("Fields to return"),
      },
    },
    async ({ jql, maxResults, startAt, fields }) => {
      try {
        const params = new URLSearchParams({ jql });
        if (maxResults) params.set("maxResults", String(maxResults));
        if (startAt) params.set("startAt", String(startAt));
        if (fields) params.set("fields", fields.join(","));
        else params.set("fields", "summary,status,assignee,priority,issuetype,created,updated,project");
        const data = await jiraApi("GET", `/search?${params.toString()}`);
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to search issues"));
      }
    },
  );

  server.registerTool(
    "jira_get_issue",
    {
      description: "Get a Jira issue by key (e.g., PROJ-123)",
      inputSchema: {
        issueKey: z.string().min(1).describe("Issue key (e.g., PROJ-123)"),
        fields: z.array(z.string()).optional().describe("Fields to return"),
      },
    },
    async ({ issueKey, fields }) => {
      try {
        const params = fields ? `?fields=${fields.join(",")}` : "";
        const data = await jiraApi("GET", `/issue/${issueKey}${params}`);
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to get issue"));
      }
    },
  );

  server.registerTool(
    "jira_create_issue",
    {
      description: "Create a new Jira issue",
      inputSchema: {
        projectKey: z.string().min(1).describe("Project key (e.g., PROJ)"),
        summary: z.string().min(1).describe("Issue summary/title"),
        issueType: z.string().optional().describe("Issue type (default: Task). Common: Bug, Story, Task, Epic"),
        description: z.string().optional().describe("Issue description (plain text, converted to ADF)"),
        assigneeAccountId: z.string().optional().describe("Assignee account ID"),
        priority: z.string().optional().describe("Priority name (e.g., High, Medium, Low)"),
        labels: z.array(z.string()).optional().describe("Labels to add"),
        parentKey: z.string().optional().describe("Parent issue key for subtasks"),
      },
    },
    async ({ projectKey, summary, issueType, description, assigneeAccountId, priority, labels, parentKey }) => {
      try {
        const fields: Record<string, unknown> = {
          project: { key: projectKey },
          summary,
          issuetype: { name: issueType || "Task" },
        };
        if (description) fields.description = textToAdf(description);
        if (assigneeAccountId) fields.assignee = { accountId: assigneeAccountId };
        if (priority) fields.priority = { name: priority };
        if (labels) fields.labels = labels;
        if (parentKey) fields.parent = { key: parentKey };
        const data = await jiraApi("POST", "/issue", { fields });
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to create issue"));
      }
    },
  );

  server.registerTool(
    "jira_update_issue",
    {
      description: "Update an existing Jira issue",
      inputSchema: {
        issueKey: z.string().min(1).describe("Issue key (e.g., PROJ-123)"),
        summary: z.string().optional().describe("New summary"),
        description: z.string().optional().describe("New description (plain text, converted to ADF)"),
        assigneeAccountId: z.string().optional().describe("New assignee account ID"),
        priority: z.string().optional().describe("New priority name"),
        labels: z.array(z.string()).optional().describe("New labels (replaces existing)"),
      },
    },
    async ({ issueKey, summary, description, assigneeAccountId, priority, labels }) => {
      try {
        const fields: Record<string, unknown> = {};
        if (summary) fields.summary = summary;
        if (description) fields.description = textToAdf(description);
        if (assigneeAccountId) fields.assignee = { accountId: assigneeAccountId };
        if (priority) fields.priority = { name: priority };
        if (labels) fields.labels = labels;
        const data = await jiraApi("PUT", `/issue/${issueKey}`, { fields });
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to update issue"));
      }
    },
  );

  server.registerTool(
    "jira_add_comment",
    {
      description: "Add a comment to a Jira issue",
      inputSchema: {
        issueKey: z.string().min(1).describe("Issue key (e.g., PROJ-123)"),
        body: z.string().min(1).describe("Comment text (plain text, converted to ADF)"),
      },
    },
    async ({ issueKey, body }) => {
      try {
        const data = await jiraApi("POST", `/issue/${issueKey}/comment`, {
          body: textToAdf(body),
        });
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to add comment"));
      }
    },
  );

  server.registerTool(
    "jira_list_comments",
    {
      description: "List comments on a Jira issue",
      inputSchema: {
        issueKey: z.string().min(1).describe("Issue key (e.g., PROJ-123)"),
        maxResults: z.number().int().min(1).max(100).optional(),
        startAt: z.number().int().min(0).optional(),
      },
    },
    async ({ issueKey, maxResults, startAt }) => {
      try {
        const params = new URLSearchParams();
        if (maxResults) params.set("maxResults", String(maxResults));
        if (startAt) params.set("startAt", String(startAt));
        const qs = params.toString() ? `?${params.toString()}` : "";
        const data = await jiraApi("GET", `/issue/${issueKey}/comment${qs}`);
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to list comments"));
      }
    },
  );

  server.registerTool(
    "jira_list_projects",
    {
      description: "List Jira projects accessible to the user",
      inputSchema: {
        maxResults: z.number().int().min(1).max(100).optional(),
        startAt: z.number().int().min(0).optional(),
      },
    },
    async ({ maxResults, startAt }) => {
      try {
        const params = new URLSearchParams();
        if (maxResults) params.set("maxResults", String(maxResults));
        if (startAt) params.set("startAt", String(startAt));
        const qs = params.toString() ? `?${params.toString()}` : "";
        const data = await jiraApi("GET", `/project/search${qs}`);
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to list projects"));
      }
    },
  );

  server.registerTool(
    "jira_get_project",
    {
      description: "Get Jira project details",
      inputSchema: {
        projectKey: z.string().min(1).describe("Project key (e.g., PROJ)"),
      },
    },
    async ({ projectKey }) => {
      try {
        const data = await jiraApi("GET", `/project/${projectKey}`);
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to get project"));
      }
    },
  );

  server.registerTool(
    "jira_get_transitions",
    {
      description: "Get available status transitions for a Jira issue",
      inputSchema: {
        issueKey: z.string().min(1).describe("Issue key (e.g., PROJ-123)"),
      },
    },
    async ({ issueKey }) => {
      try {
        const data = await jiraApi("GET", `/issue/${issueKey}/transitions`);
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to get transitions"));
      }
    },
  );

  server.registerTool(
    "jira_transition_issue",
    {
      description: "Transition a Jira issue to a new status (use jira_get_transitions to find valid transition IDs)",
      inputSchema: {
        issueKey: z.string().min(1).describe("Issue key (e.g., PROJ-123)"),
        transitionId: z.string().min(1).describe("Transition ID (from jira_get_transitions)"),
        comment: z.string().optional().describe("Optional comment to add with the transition"),
      },
    },
    async ({ issueKey, transitionId, comment }) => {
      try {
        const body: Record<string, unknown> = {
          transition: { id: transitionId },
        };
        if (comment) {
          body.update = {
            comment: [{ add: { body: textToAdf(comment) } }],
          };
        }
        const data = await jiraApi("POST", `/issue/${issueKey}/transitions`, body);
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to transition issue"));
      }
    },
  );

  server.registerTool(
    "jira_assign_issue",
    {
      description: "Assign a Jira issue to a user",
      inputSchema: {
        issueKey: z.string().min(1).describe("Issue key (e.g., PROJ-123)"),
        accountId: z.string().describe("Assignee account ID (empty string to unassign)"),
      },
    },
    async ({ issueKey, accountId }) => {
      try {
        const data = await jiraApi("PUT", `/issue/${issueKey}/assignee`, {
          accountId: accountId || null,
        });
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to assign issue"));
      }
    },
  );

  server.registerTool(
    "jira_search_users",
    {
      description: "Search for Jira users by query string",
      inputSchema: {
        query: z.string().min(1).describe("Search query (name or email)"),
        maxResults: z.number().int().min(1).max(50).optional(),
      },
    },
    async ({ query, maxResults }) => {
      try {
        const params = new URLSearchParams({ query });
        if (maxResults) params.set("maxResults", String(maxResults));
        const data = await jiraApi("GET", `/user/search?${params.toString()}`);
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to search users"));
      }
    },
  );

  server.registerTool(
    "jira_get_myself",
    {
      description: "Get the currently authenticated Jira user",
      inputSchema: {},
    },
    async () => {
      try {
        const data = await jiraApi("GET", "/myself");
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to get current user"));
      }
    },
  );
}

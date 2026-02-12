/**
 * Jira MCP Server - Issues, Projects, Comments, Transitions
 *
 * Standalone MCP endpoint for Jira tools with per-org OAuth.
 * Config: { "type": "streamable-http", "url": "/api/mcps/jira/streamable-http" }
 *
 * Jira API v3 requires:
 * - Cloud ID resolution via accessible-resources endpoint
 * - ADF (Atlassian Document Format) for rich text fields
 * - All API calls use: https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/...
 */

import type { NextRequest } from "next/server";
import { logger } from "@/lib/utils/logger";
import { oauthService } from "@/lib/services/oauth";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { authContextStorage } from "@/app/api/mcp/lib/context";
import { checkRateLimitRedis } from "@/lib/middleware/rate-limit-redis";

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

async function getJiraMcpHandler() {
  if (mcpHandler) return mcpHandler;

  const { createMcpHandler } = await import("mcp-handler");
  const { z } = await import("zod3");

  async function getJiraToken(organizationId: string): Promise<string> {
    const result = await oauthService.getValidTokenByPlatform({ organizationId, platform: "jira" });
    return result.accessToken;
  }

  // Cache cloud IDs per-org (30 min TTL)
  const cloudIdCache = new Map<string, { id: string; expiresAt: number }>();
  const CLOUD_ID_TTL_MS = 30 * 60 * 1000;

  async function getCloudId(token: string, organizationId: string): Promise<string> {
    const cached = cloudIdCache.get(organizationId);
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
    cloudIdCache.set(organizationId, { id: cloudId, expiresAt: Date.now() + CLOUD_ID_TTL_MS });
    return cloudId;
  }

  async function jiraApi(
    orgId: string,
    method: string,
    path: string,
    body?: unknown,
  ) {
    const token = await getJiraToken(orgId);
    const cloudId = await getCloudId(token, orgId);
    const url = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3${path}`;

    logger.info("[JiraMCP] API request", {
      method,
      url,
      cloudId,
    });

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
      logger.error("[JiraMCP] API error", {
        method,
        url,
        cloudId,
        status: response.status,
        statusText: response.statusText,
        errorBody: errorText.substring(0, 1000),
        responseHeaders: Object.fromEntries(response.headers.entries()),
      });
      let error: Record<string, unknown> = {};
      try { error = JSON.parse(errorText); } catch {}
      throw new Error(
        (error?.errorMessages as string[])?.join("; ") ||
        (error?.message as string) ||
        `Jira API error: ${response.status} - ${errorText.substring(0, 200)}`,
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
      server.tool("jira_status", "Check Jira OAuth connection status", {}, async () => {
        try {
          const orgId = getOrgId();
          const connections = await oauthService.listConnections({ organizationId: orgId, platform: "jira" });
          const active = connections.find((c) => c.status === "active");
          return jsonResult(active ? { connected: true, email: active.email, scopes: active.scopes } : { connected: false });
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : "Failed");
        }
      });

      server.tool(
        "jira_search_issues",
        "Search Jira issues using JQL (Jira Query Language). Example JQL: 'project = KEY AND status = \"In Progress\" ORDER BY created DESC'",
        {
          jql: z.string().min(1).describe("JQL query string"),
          maxResults: z.number().int().min(1).max(100).optional().describe("Max results (default 50)"),
          startAt: z.number().int().min(0).optional().describe("Pagination offset"),
          fields: z.array(z.string()).optional().describe("Fields to return (default: summary,status,assignee,priority,issuetype,created,updated)"),
        },
        async ({ jql, maxResults, startAt, fields }) => {
          try {
            const orgId = getOrgId();
            const params = new URLSearchParams({ jql });
            if (maxResults) params.set("maxResults", String(maxResults));
            if (startAt) params.set("startAt", String(startAt));
            if (fields) params.set("fields", fields.join(","));
            else params.set("fields", "summary,status,assignee,priority,issuetype,created,updated,project");
            const data = await jiraApi(orgId, "GET", `/search?${params.toString()}`);
            return jsonResult(data);
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      server.tool(
        "jira_get_issue",
        "Get a Jira issue by key (e.g., PROJ-123)",
        {
          issueKey: z.string().min(1).describe("Issue key (e.g., PROJ-123)"),
          fields: z.array(z.string()).optional().describe("Fields to return"),
        },
        async ({ issueKey, fields }) => {
          try {
            const orgId = getOrgId();
            const params = fields ? `?fields=${fields.join(",")}` : "";
            const data = await jiraApi(orgId, "GET", `/issue/${issueKey}${params}`);
            return jsonResult(data);
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      server.tool(
        "jira_create_issue",
        "Create a new Jira issue",
        {
          projectKey: z.string().min(1).describe("Project key (e.g., PROJ)"),
          summary: z.string().min(1).describe("Issue summary/title"),
          issueType: z.string().optional().describe("Issue type (default: Task). Common: Bug, Story, Task, Epic"),
          description: z.string().optional().describe("Issue description (plain text, converted to ADF)"),
          assigneeAccountId: z.string().optional().describe("Assignee account ID"),
          priority: z.string().optional().describe("Priority name (e.g., High, Medium, Low)"),
          labels: z.array(z.string()).optional().describe("Labels to add"),
          parentKey: z.string().optional().describe("Parent issue key for subtasks"),
        },
        async ({ projectKey, summary, issueType, description, assigneeAccountId, priority, labels, parentKey }) => {
          try {
            const orgId = getOrgId();
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
            const data = await jiraApi(orgId, "POST", "/issue", { fields });
            return jsonResult(data);
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      server.tool(
        "jira_update_issue",
        "Update an existing Jira issue",
        {
          issueKey: z.string().min(1).describe("Issue key (e.g., PROJ-123)"),
          summary: z.string().optional().describe("New summary"),
          description: z.string().optional().describe("New description (plain text, converted to ADF)"),
          assigneeAccountId: z.string().optional().describe("New assignee account ID"),
          priority: z.string().optional().describe("New priority name"),
          labels: z.array(z.string()).optional().describe("New labels (replaces existing)"),
        },
        async ({ issueKey, summary, description, assigneeAccountId, priority, labels }) => {
          try {
            const orgId = getOrgId();
            const fields: Record<string, unknown> = {};
            if (summary) fields.summary = summary;
            if (description) fields.description = textToAdf(description);
            if (assigneeAccountId) fields.assignee = { accountId: assigneeAccountId };
            if (priority) fields.priority = { name: priority };
            if (labels) fields.labels = labels;
            const data = await jiraApi(orgId, "PUT", `/issue/${issueKey}`, { fields });
            return jsonResult(data);
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      server.tool(
        "jira_add_comment",
        "Add a comment to a Jira issue",
        {
          issueKey: z.string().min(1).describe("Issue key (e.g., PROJ-123)"),
          body: z.string().min(1).describe("Comment text (plain text, converted to ADF)"),
        },
        async ({ issueKey, body }) => {
          try {
            const orgId = getOrgId();
            const data = await jiraApi(orgId, "POST", `/issue/${issueKey}/comment`, {
              body: textToAdf(body),
            });
            return jsonResult(data);
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      server.tool(
        "jira_list_comments",
        "List comments on a Jira issue",
        {
          issueKey: z.string().min(1).describe("Issue key (e.g., PROJ-123)"),
          maxResults: z.number().int().min(1).max(100).optional(),
          startAt: z.number().int().min(0).optional(),
        },
        async ({ issueKey, maxResults, startAt }) => {
          try {
            const orgId = getOrgId();
            const params = new URLSearchParams();
            if (maxResults) params.set("maxResults", String(maxResults));
            if (startAt) params.set("startAt", String(startAt));
            const qs = params.toString() ? `?${params.toString()}` : "";
            const data = await jiraApi(orgId, "GET", `/issue/${issueKey}/comment${qs}`);
            return jsonResult(data);
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      server.tool(
        "jira_list_projects",
        "List Jira projects accessible to the user",
        {
          maxResults: z.number().int().min(1).max(100).optional(),
          startAt: z.number().int().min(0).optional(),
        },
        async ({ maxResults, startAt }) => {
          try {
            const orgId = getOrgId();
            const params = new URLSearchParams();
            if (maxResults) params.set("maxResults", String(maxResults));
            if (startAt) params.set("startAt", String(startAt));
            const qs = params.toString() ? `?${params.toString()}` : "";
            const data = await jiraApi(orgId, "GET", `/project/search${qs}`);
            return jsonResult(data);
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      server.tool(
        "jira_get_project",
        "Get Jira project details",
        {
          projectKey: z.string().min(1).describe("Project key (e.g., PROJ)"),
        },
        async ({ projectKey }) => {
          try {
            const orgId = getOrgId();
            const data = await jiraApi(orgId, "GET", `/project/${projectKey}`);
            return jsonResult(data);
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      server.tool(
        "jira_get_transitions",
        "Get available status transitions for a Jira issue",
        {
          issueKey: z.string().min(1).describe("Issue key (e.g., PROJ-123)"),
        },
        async ({ issueKey }) => {
          try {
            const orgId = getOrgId();
            const data = await jiraApi(orgId, "GET", `/issue/${issueKey}/transitions`);
            return jsonResult(data);
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      server.tool(
        "jira_transition_issue",
        "Transition a Jira issue to a new status (use jira_get_transitions to find valid transition IDs)",
        {
          issueKey: z.string().min(1).describe("Issue key (e.g., PROJ-123)"),
          transitionId: z.string().min(1).describe("Transition ID (from jira_get_transitions)"),
          comment: z.string().optional().describe("Optional comment to add with the transition"),
        },
        async ({ issueKey, transitionId, comment }) => {
          try {
            const orgId = getOrgId();
            const body: Record<string, unknown> = {
              transition: { id: transitionId },
            };
            if (comment) {
              body.update = {
                comment: [{ add: { body: textToAdf(comment) } }],
              };
            }
            const data = await jiraApi(orgId, "POST", `/issue/${issueKey}/transitions`, body);
            return jsonResult(data);
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      server.tool(
        "jira_assign_issue",
        "Assign a Jira issue to a user",
        {
          issueKey: z.string().min(1).describe("Issue key (e.g., PROJ-123)"),
          accountId: z.string().describe("Assignee account ID (empty string to unassign)"),
        },
        async ({ issueKey, accountId }) => {
          try {
            const orgId = getOrgId();
            const data = await jiraApi(orgId, "PUT", `/issue/${issueKey}/assignee`, {
              accountId: accountId || null,
            });
            return jsonResult(data);
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      server.tool(
        "jira_search_users",
        "Search for Jira users by query string",
        {
          query: z.string().min(1).describe("Search query (name or email)"),
          maxResults: z.number().int().min(1).max(50).optional(),
        },
        async ({ query, maxResults }) => {
          try {
            const orgId = getOrgId();
            const params = new URLSearchParams({ query });
            if (maxResults) params.set("maxResults", String(maxResults));
            const data = await jiraApi(orgId, "GET", `/user/search?${params.toString()}`);
            return jsonResult(data);
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      server.tool("jira_get_myself", "Get the currently authenticated Jira user", {}, async () => {
        try {
          const orgId = getOrgId();
          const data = await jiraApi(orgId, "GET", "/myself");
          return jsonResult(data);
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : "Failed");
        }
      });
    },
    { capabilities: { tools: {} } },
    { basePath: "/api/mcps/jira", maxDuration: 60 },
  );

  return mcpHandler;
}

async function handleRequest(req: NextRequest): Promise<Response> {
  try {
    const authResult = await requireAuthOrApiKeyWithOrg(req);

    const rateLimitKey = `mcp:ratelimit:jira:${authResult.user.organization_id}`;
    const rateLimit = await checkRateLimitRedis(rateLimitKey, 60000, 100);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ error: "rate_limit_exceeded" }), { status: 429, headers: { "Content-Type": "application/json" } });
    }

    const handler = await getJiraMcpHandler();
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
    logger.error(`[JiraMCP] ${msg}`);
    const isAuth = msg.includes("API key") || msg.includes("auth") || msg.includes("Unauthorized");
    return new Response(JSON.stringify({ error: isAuth ? "authentication_required" : "internal_error", message: msg }), { status: isAuth ? 401 : 500, headers: { "Content-Type": "application/json" } });
  }
}

export const GET = handleRequest;
export const POST = handleRequest;
export const DELETE = handleRequest;

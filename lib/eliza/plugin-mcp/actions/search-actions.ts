import {
  type Action,
  type ActionResult,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
  logger,
} from "@elizaos/core";
import type { McpService } from "../service";
import { MCP_SERVICE_NAME } from "../types";
import { createMcpToolAction } from "./dynamic-tool-actions";

// ─── SEARCH_ACTIONS ─────────────────────────────────────────────────────────

export const searchActionsAction: Action = {
  name: "SEARCH_ACTIONS",
  description:
    "Search for available MCP tool actions by keyword. Discovers tools beyond the always-visible set. " +
    "Returns matching actions with descriptions and parameter schemas. " +
    "Found actions are automatically registered so the agent can use them.",
  similes: [
    "FIND_ACTIONS",
    "DISCOVER_ACTIONS",
    "SEARCH_TOOLS",
    "FIND_TOOLS",
    "DISCOVER_TOOLS",
    "LOOKUP_ACTIONS",
  ],

  validate: async () => true,

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    const svc = runtime.getService<McpService>(MCP_SERVICE_NAME);
    if (!svc) {
      return { success: false, error: "MCP service not available" };
    }

    const content = message.content as Record<string, unknown>;
    const params =
      (content.actionParams as Record<string, unknown>) ||
      (content.actionInput as Record<string, unknown>) ||
      (state?.data?.actionParams as Record<string, unknown>) ||
      {};

    const query = (params.query as string) || (content.text as string) || "";
    const platform = (params.platform as string) || undefined;
    const rawLimit = Number(params.limit) || 8;
    const limit = Math.min(Math.max(rawLimit, 1), 20);

    if (!query.trim()) {
      return { success: false, error: "A search query is required" };
    }

    const tier2Index = svc.getTier2Index();
    const results = tier2Index.search(query, platform, limit);

    if (results.length === 0) {
      const text = platform
        ? `No actions found matching "${query}" for platform "${platform}".`
        : `No actions found matching "${query}".`;
      if (callback) await callback({ text });
      return { success: true, text, data: { query, platform, resultCount: 0 } };
    }

    // Register discovered actions on the runtime (skip already-registered)
    const existingNames = new Set(runtime.actions.map((a) => a.name));
    const newlyRegistered: string[] = [];

    for (const entry of results) {
      if (existingNames.has(entry.actionName)) continue;
      const action = createMcpToolAction(entry.serverName, entry.tool, existingNames);
      runtime.registerAction(action);
      existingNames.add(action.name);
      newlyRegistered.push(action.name);
    }

    // Format results like the ACTIONS provider does
    const lines: string[] = [`Found ${results.length} action(s) for "${query}":\n`];
    for (const entry of results) {
      const desc = entry.tool.description || "No description";
      const props = entry.tool.inputSchema?.properties;
      const paramSummary = props
        ? Object.keys(props as Record<string, unknown>).join(", ")
        : "none";
      lines.push(`- **${entry.actionName}**: ${desc}`);
      lines.push(`  Platform: ${entry.platform} | Params: ${paramSummary}`);
    }

    if (newlyRegistered.length > 0) {
      lines.push(`\n${newlyRegistered.length} new action(s) registered and ready to use.`);
    }

    const text = lines.join("\n");
    if (callback) await callback({ text });

    return {
      success: true,
      text,
      data: {
        query,
        platform,
        resultCount: results.length,
        newlyRegistered,
        actions: results.map((r) => ({
          name: r.actionName,
          serverName: r.serverName,
          toolName: r.toolName,
          platform: r.platform,
          description: r.tool.description,
        })),
      },
    };
  },

  examples: [
    [
      { name: "{{user}}", content: { text: "Search for email-related actions" } },
      {
        name: "{{assistant}}",
        content: {
          text: "I'll search for email-related actions.",
          actions: ["SEARCH_ACTIONS"],
        },
      },
    ],
    [
      { name: "{{user}}", content: { text: "Find actions for creating Linear issues" } },
      {
        name: "{{assistant}}",
        content: {
          text: "Let me search for Linear issue actions.",
          actions: ["SEARCH_ACTIONS"],
        },
      },
    ],
  ],
};

// ─── LIST_CONNECTIONS ───────────────────────────────────────────────────────

export const listConnectionsAction: Action = {
  name: "LIST_CONNECTIONS",
  description:
    "List OAuth connections for the current organization. " +
    "Shows connected platforms, status, email, scopes, and linked date. " +
    "Optionally filter by platform name.",
  similes: [
    "SHOW_CONNECTIONS",
    "GET_CONNECTIONS",
    "OAUTH_CONNECTIONS",
    "MY_CONNECTIONS",
    "CONNECTED_SERVICES",
  ],

  validate: async () => true,

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    const orgId = runtime.getSetting("ORGANIZATION_ID") as string | undefined;
    if (!orgId) {
      return { success: false, error: "No organization context available" };
    }

    const content = message.content as Record<string, unknown>;
    const params =
      (content.actionParams as Record<string, unknown>) ||
      (content.actionInput as Record<string, unknown>) ||
      (state?.data?.actionParams as Record<string, unknown>) ||
      {};
    const platform = (params.platform as string) || undefined;

    let connections: Array<{
      id: string;
      platform: string;
      status: string;
      email?: string;
      scopes: string[];
      linkedAt: Date;
    }>;

    try {
      const { oauthService } = await import("../../../services/oauth");
      connections = await oauthService.listConnections({
        organizationId: orgId,
        platform,
      });
    } catch (e) {
      logger.error({ error: e }, "[LIST_CONNECTIONS] Failed to fetch connections");
      return { success: false, error: "Failed to fetch OAuth connections" };
    }

    if (connections.length === 0) {
      const text = platform
        ? `No connections found for platform "${platform}".`
        : "No OAuth connections found.";
      if (callback) await callback({ text });
      return { success: true, text, data: { connectionCount: 0, platform } };
    }

    const lines: string[] = [`Found ${connections.length} connection(s):\n`];
    for (const conn of connections) {
      const email = conn.email ? ` (${conn.email})` : "";
      const scopes = conn.scopes.length > 0 ? conn.scopes.join(", ") : "default";
      const linked = conn.linkedAt.toISOString().split("T")[0];
      lines.push(`- **${conn.platform}**${email} — Status: ${conn.status}`);
      lines.push(`  Scopes: ${scopes} | Linked: ${linked}`);
    }

    const text = lines.join("\n");
    if (callback) await callback({ text });

    return {
      success: true,
      text,
      data: {
        platform,
        connectionCount: connections.length,
        connections: connections.map((c) => ({
          id: c.id,
          platform: c.platform,
          status: c.status,
          email: c.email,
          scopes: c.scopes,
          linkedAt: c.linkedAt,
        })),
      },
    };
  },

  examples: [
    [
      { name: "{{user}}", content: { text: "What services are connected?" } },
      {
        name: "{{assistant}}",
        content: {
          text: "Let me check your connected services.",
          actions: ["LIST_CONNECTIONS"],
        },
      },
    ],
    [
      { name: "{{user}}", content: { text: "Show my Google connections" } },
      {
        name: "{{assistant}}",
        content: {
          text: "I'll look up your Google connections.",
          actions: ["LIST_CONNECTIONS"],
        },
      },
    ],
  ],
};

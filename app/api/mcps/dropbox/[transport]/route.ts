/**
 * Dropbox MCP Server - Files, Folders, Sharing
 *
 * Standalone MCP endpoint for Dropbox tools with per-org OAuth.
 * Config: { "type": "streamable-http", "url": "/api/mcps/dropbox/streamable-http" }
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

async function getDropboxMcpHandler() {
  if (mcpHandler) return mcpHandler;

  const { createMcpHandler } = await import("mcp-handler");
  const { z } = await import("zod3");

  async function getDropboxToken(organizationId: string): Promise<string> {
    const result = await oauthService.getValidTokenByPlatform({ organizationId, platform: "dropbox" });
    return result.accessToken;
  }

  /** Dropbox RPC API call (JSON request/response at api.dropboxapi.com) */
  async function dropboxRpc(orgId: string, endpoint: string, body?: object) {
    const token = await getDropboxToken(orgId);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    const options: RequestInit = { method: "POST", headers };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`https://api.dropboxapi.com${endpoint}`, options);

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const summary = error.error_summary || error.error?.[".tag"] || `HTTP ${response.status}`;
      throw new Error(`Dropbox API error: ${summary}`);
    }

    if (response.status === 204) return {};
    const text = await response.text();
    if (!text) return {};
    return JSON.parse(text);
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
      // --- Connection Status ---
      server.tool("dropbox_status", "Check Dropbox OAuth connection status", {}, async () => {
        try {
          const orgId = getOrgId();
          const connections = await oauthService.listConnections({ organizationId: orgId, platform: "dropbox" });
          const active = connections.find((c) => c.status === "active");
          if (!active) {
            const expired = connections.find((c) => c.status === "expired");
            if (expired) {
              return jsonResult({ connected: false, status: "expired", message: "Dropbox connection expired. Please reconnect in Settings > Connections." });
            }
            return jsonResult({ connected: false });
          }
          return jsonResult({ connected: true, email: active.email, scopes: active.scopes });
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : "Failed");
        }
      });

      // --- Account ---
      server.tool("dropbox_get_account", "Get current Dropbox account info", {}, async () => {
        try {
          const data = await dropboxRpc(getOrgId(), "/2/users/get_current_account");
          return jsonResult(data);
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : "Failed");
        }
      });

      server.tool("dropbox_get_space_usage", "Get Dropbox storage space usage", {}, async () => {
        try {
          const data = await dropboxRpc(getOrgId(), "/2/users/get_space_usage");
          return jsonResult(data);
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : "Failed");
        }
      });

      // --- File Operations ---
      server.tool(
        "dropbox_list_folder",
        "List files and folders in a Dropbox directory. Use empty string for root.",
        {
          path: z.string().describe('Folder path (empty string "" for root, or "/path/to/folder")'),
          recursive: z.boolean().optional().describe("List recursively"),
          limit: z.number().int().min(1).max(2000).optional().describe("Max entries to return"),
        },
        async ({ path, recursive, limit }) => {
          try {
            const body: Record<string, unknown> = { path };
            if (recursive !== undefined) body.recursive = recursive;
            if (limit !== undefined) body.limit = limit;
            const data = await dropboxRpc(getOrgId(), "/2/files/list_folder", body);
            return jsonResult(data);
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      server.tool(
        "dropbox_list_folder_continue",
        "Continue listing files using cursor from a previous list_folder call",
        { cursor: z.string().min(1).describe("Cursor from previous list_folder response") },
        async ({ cursor }) => {
          try {
            const data = await dropboxRpc(getOrgId(), "/2/files/list_folder/continue", { cursor });
            return jsonResult(data);
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      server.tool(
        "dropbox_get_metadata",
        "Get metadata for a file or folder",
        {
          path: z.string().min(1).describe("File or folder path"),
          include_media_info: z.boolean().optional(),
        },
        async ({ path, include_media_info }) => {
          try {
            const body: Record<string, unknown> = { path };
            if (include_media_info !== undefined) body.include_media_info = include_media_info;
            const data = await dropboxRpc(getOrgId(), "/2/files/get_metadata", body);
            return jsonResult(data);
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      server.tool(
        "dropbox_search",
        "Search for files and folders in Dropbox",
        {
          query: z.string().min(1).describe("Search query"),
          path: z.string().optional().describe("Folder to search within"),
          max_results: z.number().int().min(1).max(1000).optional(),
          file_status: z.enum(["active", "deleted"]).optional(),
        },
        async ({ query, path, max_results, file_status }) => {
          try {
            const body: Record<string, unknown> = { query };
            const options: Record<string, unknown> = {};
            if (path) options.path = path;
            if (max_results) options.max_results = max_results;
            if (file_status) options.file_status = file_status;
            if (Object.keys(options).length > 0) body.options = options;
            const data = await dropboxRpc(getOrgId(), "/2/files/search_v2", body);
            return jsonResult(data);
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      server.tool(
        "dropbox_create_folder",
        "Create a new folder in Dropbox",
        {
          path: z.string().min(1).describe("Path for the new folder (e.g. /Documents/NewFolder)"),
          autorename: z.boolean().optional().describe("Auto-rename if folder exists"),
        },
        async ({ path, autorename }) => {
          try {
            const body: Record<string, unknown> = { path };
            if (autorename !== undefined) body.autorename = autorename;
            const data = await dropboxRpc(getOrgId(), "/2/files/create_folder_v2", body);
            return jsonResult(data);
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      server.tool(
        "dropbox_upload_text",
        "Upload/create a text file in Dropbox. Use for creating new files with text content.",
        {
          path: z.string().min(1).describe("File path including name (e.g. /Documents/notes.txt)"),
          content: z.string().describe("Text content of the file"),
          mode: z.enum(["add", "overwrite"]).optional().describe("'add' to avoid overwriting (default), 'overwrite' to replace existing"),
          autorename: z.boolean().optional().describe("Auto-rename if file exists (only with mode=add)"),
        },
        async ({ path, content, mode, autorename }) => {
          try {
            const orgId = getOrgId();
            const token = await getDropboxToken(orgId);
            const apiArg: Record<string, unknown> = { path, mode: mode || "add" };
            if (autorename !== undefined) apiArg.autorename = autorename;

            const response = await fetch("https://content.dropboxapi.com/2/files/upload", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/octet-stream",
                "Dropbox-API-Arg": JSON.stringify(apiArg),
              },
              body: content,
            });

            if (!response.ok) {
              const error = await response.json().catch(() => ({}));
              throw new Error(error.error_summary || `Upload failed: ${response.status}`);
            }

            const data = await response.json();
            return jsonResult(data);
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      server.tool(
        "dropbox_delete",
        "Delete a file or folder from Dropbox",
        { path: z.string().min(1).describe("Path to delete") },
        async ({ path }) => {
          try {
            const data = await dropboxRpc(getOrgId(), "/2/files/delete_v2", { path });
            return jsonResult(data);
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      server.tool(
        "dropbox_move",
        "Move a file or folder to a new location",
        {
          from_path: z.string().min(1).describe("Current path"),
          to_path: z.string().min(1).describe("Destination path"),
          autorename: z.boolean().optional(),
          allow_ownership_transfer: z.boolean().optional(),
        },
        async ({ from_path, to_path, autorename, allow_ownership_transfer }) => {
          try {
            const body: Record<string, unknown> = { from_path, to_path };
            if (autorename !== undefined) body.autorename = autorename;
            if (allow_ownership_transfer !== undefined) body.allow_ownership_transfer = allow_ownership_transfer;
            const data = await dropboxRpc(getOrgId(), "/2/files/move_v2", body);
            return jsonResult(data);
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      server.tool(
        "dropbox_copy",
        "Copy a file or folder to a new location",
        {
          from_path: z.string().min(1).describe("Source path"),
          to_path: z.string().min(1).describe("Destination path"),
          autorename: z.boolean().optional(),
        },
        async ({ from_path, to_path, autorename }) => {
          try {
            const body: Record<string, unknown> = { from_path, to_path };
            if (autorename !== undefined) body.autorename = autorename;
            const data = await dropboxRpc(getOrgId(), "/2/files/copy_v2", body);
            return jsonResult(data);
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      // --- Sharing ---
      server.tool(
        "dropbox_create_shared_link",
        "Create a shared link for a file or folder",
        {
          path: z.string().min(1).describe("File or folder path"),
          requested_visibility: z.enum(["public", "team_only", "password"]).optional(),
        },
        async ({ path, requested_visibility }) => {
          try {
            const body: Record<string, unknown> = { path };
            if (requested_visibility) {
              body.settings = { requested_visibility };
            }
            const data = await dropboxRpc(getOrgId(), "/2/sharing/create_shared_link_with_settings", body);
            return jsonResult(data);
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      server.tool(
        "dropbox_list_shared_links",
        "List shared links for a file/folder or all shared links",
        {
          path: z.string().optional().describe("File/folder path (omit for all shared links)"),
          cursor: z.string().optional().describe("Cursor for pagination"),
          direct_only: z.boolean().optional(),
        },
        async ({ path, cursor, direct_only }) => {
          try {
            const body: Record<string, unknown> = {};
            if (path) body.path = path;
            if (cursor) body.cursor = cursor;
            if (direct_only !== undefined) body.direct_only = direct_only;
            const data = await dropboxRpc(getOrgId(), "/2/sharing/list_shared_links", body);
            return jsonResult(data);
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );

      server.tool(
        "dropbox_revoke_shared_link",
        "Revoke a shared link",
        { url: z.string().min(1).describe("The shared link URL to revoke") },
        async ({ url }) => {
          try {
            await dropboxRpc(getOrgId(), "/2/sharing/revoke_shared_link", { url });
            return jsonResult({ success: true });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        },
      );
    },
    { capabilities: { tools: {} } },
    { streamableHttpEndpoint: "/api/mcps/dropbox/streamable-http", disableSse: true, maxDuration: 60 },
  );

  return mcpHandler;
}

async function handleRequest(req: NextRequest): Promise<Response> {
  try {
    const authResult = await requireAuthOrApiKeyWithOrg(req);

    const rateLimitKey = `mcp:ratelimit:dropbox:${authResult.user.organization_id}`;
    const rateLimit = await checkRateLimitRedis(rateLimitKey, 60000, 100);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ error: "rate_limit_exceeded" }), { status: 429, headers: { "Content-Type": "application/json" } });
    }

    const handler = await getDropboxMcpHandler();
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
    logger.error(`[DropboxMCP] ${msg}`);
    const isAuth = msg.includes("API key") || msg.includes("auth") || msg.includes("Unauthorized");
    return new Response(JSON.stringify({ error: isAuth ? "authentication_required" : "internal_error", message: msg }), { status: isAuth ? 401 : 500, headers: { "Content-Type": "application/json" } });
  }
}

async function withTransportValidation(
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
  return handleRequest(req);
}

export const GET = withTransportValidation;
export const POST = withTransportValidation;
export const DELETE = withTransportValidation;

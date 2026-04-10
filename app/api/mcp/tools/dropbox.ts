// @ts-nocheck — MCP tool types cause exponential type inference
/**
 * Dropbox MCP Tools - Files, Folders, Sharing
 * Uses per-organization OAuth tokens via oauthService.
 */

import type { McpServer } from "mcp-handler";
import { z } from "zod3";
import { oauthService } from "@/lib/services/oauth";
import { logger } from "@/lib/utils/logger";
import { getAuthContext } from "../lib/context";
import { errorResponse, jsonResponse } from "../lib/responses";

async function getDropboxToken(): Promise<string> {
  const { user } = getAuthContext();
  try {
    const result = await oauthService.getValidTokenByPlatform({
      organizationId: user.organization_id,
      userId: user.id,
      platform: "dropbox",
    });
    return result.accessToken;
  } catch (error) {
    logger.warn("[DropboxMCP] Failed to get token", {
      organizationId: user.organization_id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error("Dropbox account not connected. Connect in Settings > Connections.");
  }
}

/** Dropbox RPC API call (JSON request/response at api.dropboxapi.com) */
async function dropboxRpc(endpoint: string, body?: object) {
  const token = await getDropboxToken();
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

function errMsg(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function registerDropboxTools(server: McpServer): void {
  // --- Connection Status ---
  server.registerTool(
    "dropbox_status",
    {
      description: "Check Dropbox OAuth connection status",
      inputSchema: {},
    },
    async () => {
      try {
        const { user } = getAuthContext();
        const connections = await oauthService.listConnections({
          organizationId: user.organization_id,
          userId: user.id,
          platform: "dropbox",
        });
        const active = connections.find((c) => c.status === "active");
        if (!active) {
          return jsonResponse({
            connected: false,
            message: "Dropbox not connected. Connect in Settings > Connections.",
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

  // --- Account ---
  server.registerTool(
    "dropbox_get_account",
    {
      description: "Get current Dropbox account info",
      inputSchema: {},
    },
    async () => {
      try {
        const data = await dropboxRpc("/2/users/get_current_account");
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to get account"));
      }
    },
  );

  server.registerTool(
    "dropbox_get_space_usage",
    {
      description: "Get Dropbox storage space usage",
      inputSchema: {},
    },
    async () => {
      try {
        const data = await dropboxRpc("/2/users/get_space_usage");
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to get space usage"));
      }
    },
  );

  // --- File Operations ---
  server.registerTool(
    "dropbox_list_folder",
    {
      description: "List files and folders in a Dropbox directory. Use empty string for root.",
      inputSchema: {
        path: z.string().describe('Folder path (empty string "" for root, or "/path/to/folder")'),
        recursive: z.boolean().optional().describe("List recursively"),
        limit: z.number().int().min(1).max(2000).optional().describe("Max entries to return"),
      },
    },
    async ({ path, recursive, limit }) => {
      try {
        const body: Record<string, unknown> = { path };
        if (recursive !== undefined) body.recursive = recursive;
        if (limit !== undefined) body.limit = limit;
        const data = await dropboxRpc("/2/files/list_folder", body);
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to list folder"));
      }
    },
  );

  server.registerTool(
    "dropbox_list_folder_continue",
    {
      description: "Continue listing files using cursor from a previous list_folder call",
      inputSchema: {
        cursor: z.string().min(1).describe("Cursor from previous list_folder response"),
      },
    },
    async ({ cursor }) => {
      try {
        const data = await dropboxRpc("/2/files/list_folder/continue", { cursor });
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to continue listing"));
      }
    },
  );

  server.registerTool(
    "dropbox_get_metadata",
    {
      description: "Get metadata for a file or folder",
      inputSchema: {
        path: z.string().min(1).describe("File or folder path"),
        include_media_info: z.boolean().optional(),
      },
    },
    async ({ path, include_media_info }) => {
      try {
        const body: Record<string, unknown> = { path };
        if (include_media_info !== undefined) body.include_media_info = include_media_info;
        const data = await dropboxRpc("/2/files/get_metadata", body);
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to get metadata"));
      }
    },
  );

  server.registerTool(
    "dropbox_search",
    {
      description: "Search for files and folders in Dropbox",
      inputSchema: {
        query: z.string().min(1).describe("Search query"),
        path: z.string().optional().describe("Folder to search within"),
        max_results: z.number().int().min(1).max(1000).optional(),
        file_status: z.enum(["active", "deleted"]).optional(),
      },
    },
    async ({ query, path, max_results, file_status }) => {
      try {
        const body: Record<string, unknown> = { query };
        const options: Record<string, unknown> = {};
        if (path) options.path = path;
        if (max_results) options.max_results = max_results;
        if (file_status) options.file_status = file_status;
        if (Object.keys(options).length > 0) body.options = options;
        const data = await dropboxRpc("/2/files/search_v2", body);
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to search"));
      }
    },
  );

  server.registerTool(
    "dropbox_create_folder",
    {
      description: "Create a new folder in Dropbox",
      inputSchema: {
        path: z.string().min(1).describe("Path for the new folder (e.g. /Documents/NewFolder)"),
        autorename: z.boolean().optional().describe("Auto-rename if folder exists"),
      },
    },
    async ({ path, autorename }) => {
      try {
        const body: Record<string, unknown> = { path };
        if (autorename !== undefined) body.autorename = autorename;
        const data = await dropboxRpc("/2/files/create_folder_v2", body);
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to create folder"));
      }
    },
  );

  server.registerTool(
    "dropbox_upload_text",
    {
      description:
        "Upload/create a text file in Dropbox. Use for creating new files with text content.",
      inputSchema: {
        path: z.string().min(1).describe("File path including name (e.g. /Documents/notes.txt)"),
        content: z.string().describe("Text content of the file"),
        mode: z
          .enum(["add", "overwrite"])
          .optional()
          .describe("'add' to avoid overwriting (default), 'overwrite' to replace existing"),
        autorename: z
          .boolean()
          .optional()
          .describe("Auto-rename if file exists (only with mode=add)"),
      },
    },
    async ({ path, content, mode, autorename }) => {
      try {
        const token = await getDropboxToken();
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
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to upload file"));
      }
    },
  );

  server.registerTool(
    "dropbox_delete",
    {
      description: "Delete a file or folder from Dropbox",
      inputSchema: {
        path: z.string().min(1).describe("Path to delete"),
      },
    },
    async ({ path }) => {
      try {
        const data = await dropboxRpc("/2/files/delete_v2", { path });
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to delete"));
      }
    },
  );

  server.registerTool(
    "dropbox_move",
    {
      description: "Move a file or folder to a new location",
      inputSchema: {
        from_path: z.string().min(1).describe("Current path"),
        to_path: z.string().min(1).describe("Destination path"),
        autorename: z.boolean().optional(),
        allow_ownership_transfer: z.boolean().optional(),
      },
    },
    async ({ from_path, to_path, autorename, allow_ownership_transfer }) => {
      try {
        const body: Record<string, unknown> = { from_path, to_path };
        if (autorename !== undefined) body.autorename = autorename;
        if (allow_ownership_transfer !== undefined)
          body.allow_ownership_transfer = allow_ownership_transfer;
        const data = await dropboxRpc("/2/files/move_v2", body);
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to move"));
      }
    },
  );

  server.registerTool(
    "dropbox_copy",
    {
      description: "Copy a file or folder to a new location",
      inputSchema: {
        from_path: z.string().min(1).describe("Source path"),
        to_path: z.string().min(1).describe("Destination path"),
        autorename: z.boolean().optional(),
      },
    },
    async ({ from_path, to_path, autorename }) => {
      try {
        const body: Record<string, unknown> = { from_path, to_path };
        if (autorename !== undefined) body.autorename = autorename;
        const data = await dropboxRpc("/2/files/copy_v2", body);
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to copy"));
      }
    },
  );

  // --- Sharing ---
  server.registerTool(
    "dropbox_create_shared_link",
    {
      description: "Create a shared link for a file or folder",
      inputSchema: {
        path: z.string().min(1).describe("File or folder path"),
        requested_visibility: z.enum(["public", "team_only", "password"]).optional(),
      },
    },
    async ({ path, requested_visibility }) => {
      try {
        const body: Record<string, unknown> = { path };
        if (requested_visibility) {
          body.settings = { requested_visibility };
        }
        const data = await dropboxRpc("/2/sharing/create_shared_link_with_settings", body);
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to create shared link"));
      }
    },
  );

  server.registerTool(
    "dropbox_list_shared_links",
    {
      description: "List shared links for a file/folder or all shared links",
      inputSchema: {
        path: z.string().optional().describe("File/folder path (omit for all shared links)"),
        cursor: z.string().optional().describe("Cursor for pagination"),
        direct_only: z.boolean().optional(),
      },
    },
    async ({ path, cursor, direct_only }) => {
      try {
        const body: Record<string, unknown> = {};
        if (path) body.path = path;
        if (cursor) body.cursor = cursor;
        if (direct_only !== undefined) body.direct_only = direct_only;
        const data = await dropboxRpc("/2/sharing/list_shared_links", body);
        return jsonResponse(data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to list shared links"));
      }
    },
  );

  server.registerTool(
    "dropbox_revoke_shared_link",
    {
      description: "Revoke a shared link",
      inputSchema: {
        url: z.string().min(1).describe("The shared link URL to revoke"),
      },
    },
    async ({ url }) => {
      try {
        await dropboxRpc("/2/sharing/revoke_shared_link", { url });
        return jsonResponse({ success: true });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to revoke shared link"));
      }
    },
  );
}

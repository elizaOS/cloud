/**
 * Bluesky MCP Tools - Posts, Timeline, Notifications
 * Uses per-organization AT Protocol OAuth via getBlueskyAgent().
 */

import type { McpServer } from "mcp-handler";
import { z } from "zod3";
import { logger } from "@/lib/utils/logger";
import { oauthService } from "@/lib/services/oauth";
import { getBlueskyAgent } from "@/lib/services/oauth/providers/bluesky-at";
import { getAuthContext } from "../lib/context";
import { jsonResponse, errorResponse } from "../lib/responses";

function errMsg(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function getOrgId(): string {
  const { user } = getAuthContext();
  return user.organization_id;
}

export function registerBlueskyTools(server: McpServer): void {
  // ─── Connection status ──────────────────────────────────────────

  server.registerTool(
    "bluesky_status",
    {
      description: "Check Bluesky OAuth connection status",
      inputSchema: {},
    },
    async () => {
      try {
        const orgId = getOrgId();
        const connections = await oauthService.listConnections({
          organizationId: orgId,
          platform: "bluesky",
        });
        const active = connections.find((c) => c.status === "active");
        if (!active) {
          return jsonResponse({
            connected: false,
            message:
              "Bluesky not connected. Connect in Settings > Connections.",
          });
        }
        return jsonResponse({
          connected: true,
          handle: active.username,
          did: active.platformUserId,
          displayName: active.displayName,
          scopes: active.scopes,
          linkedAt: active.linkedAt,
        });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to check status"));
      }
    },
  );

  // ─── Get profile ────────────────────────────────────────────────

  server.registerTool(
    "bluesky_get_profile",
    {
      description: "Get a Bluesky user profile by handle or DID",
      inputSchema: {
        actor: z
          .string()
          .min(1)
          .describe("Handle (e.g., alice.bsky.social) or DID"),
      },
    },
    async ({ actor }) => {
      try {
        const agent = await getBlueskyAgent(getOrgId());
        const res = await agent.getProfile({ actor });
        return jsonResponse(res.data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to get profile"));
      }
    },
  );

  // ─── Create post ────────────────────────────────────────────────

  server.registerTool(
    "bluesky_create_post",
    {
      description: "Create a Bluesky post (max 300 characters)",
      inputSchema: {
        text: z
          .string()
          .min(1)
          .max(300)
          .describe("Post text content"),
      },
    },
    async ({ text }) => {
      try {
        const agent = await getBlueskyAgent(getOrgId());
        const res = await agent.post({ text });
        return jsonResponse(res);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to create post"));
      }
    },
  );

  // ─── Get timeline ───────────────────────────────────────────────

  server.registerTool(
    "bluesky_get_timeline",
    {
      description: "Get home timeline feed",
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Number of posts (default 50)"),
        cursor: z
          .string()
          .optional()
          .describe("Pagination cursor"),
      },
    },
    async ({ limit, cursor }) => {
      try {
        const agent = await getBlueskyAgent(getOrgId());
        const res = await agent.getTimeline({ limit, cursor });
        return jsonResponse(res.data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to get timeline"));
      }
    },
  );

  // ─── Search posts ───────────────────────────────────────────────

  server.registerTool(
    "bluesky_search_posts",
    {
      description: "Search Bluesky posts",
      inputSchema: {
        q: z.string().min(1).describe("Search query"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Number of results"),
      },
    },
    async ({ q, limit }) => {
      try {
        const agent = await getBlueskyAgent(getOrgId());
        const res = await agent.app.bsky.feed.searchPosts({ q, limit });
        return jsonResponse(res.data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to search posts"));
      }
    },
  );

  // ─── Like post ──────────────────────────────────────────────────

  server.registerTool(
    "bluesky_like_post",
    {
      description: "Like a Bluesky post",
      inputSchema: {
        uri: z.string().min(1).describe("AT URI of the post"),
        cid: z.string().min(1).describe("CID of the post"),
      },
    },
    async ({ uri, cid }) => {
      try {
        const agent = await getBlueskyAgent(getOrgId());
        const res = await agent.like(uri, cid);
        return jsonResponse(res);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to like post"));
      }
    },
  );

  // ─── Repost ─────────────────────────────────────────────────────

  server.registerTool(
    "bluesky_repost",
    {
      description: "Repost a Bluesky post",
      inputSchema: {
        uri: z.string().min(1).describe("AT URI of the post"),
        cid: z.string().min(1).describe("CID of the post"),
      },
    },
    async ({ uri, cid }) => {
      try {
        const agent = await getBlueskyAgent(getOrgId());
        const res = await agent.repost(uri, cid);
        return jsonResponse(res);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to repost"));
      }
    },
  );

  // ─── Follow user ───────────────────────────────────────────────

  server.registerTool(
    "bluesky_follow",
    {
      description: "Follow a Bluesky user",
      inputSchema: {
        did: z
          .string()
          .min(1)
          .describe("DID of the user to follow"),
      },
    },
    async ({ did }) => {
      try {
        const agent = await getBlueskyAgent(getOrgId());
        const res = await agent.follow(did);
        return jsonResponse(res);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to follow user"));
      }
    },
  );

  // ─── Get notifications ──────────────────────────────────────────

  server.registerTool(
    "bluesky_get_notifications",
    {
      description:
        "Get notifications (likes, follows, replies, mentions)",
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Number of notifications"),
        cursor: z
          .string()
          .optional()
          .describe("Pagination cursor"),
      },
    },
    async ({ limit, cursor }) => {
      try {
        const agent = await getBlueskyAgent(getOrgId());
        const res = await agent.listNotifications({ limit, cursor });
        return jsonResponse(res.data);
      } catch (error) {
        return errorResponse(
          errMsg(error, "Failed to get notifications"),
        );
      }
    },
  );

  // ─── Get post thread ────────────────────────────────────────────

  server.registerTool(
    "bluesky_get_thread",
    {
      description: "Get a post thread with replies",
      inputSchema: {
        uri: z.string().min(1).describe("AT URI of the post"),
        depth: z
          .number()
          .int()
          .min(0)
          .max(10)
          .optional()
          .describe("Reply depth (default 6)"),
      },
    },
    async ({ uri, depth }) => {
      try {
        const agent = await getBlueskyAgent(getOrgId());
        const res = await agent.getPostThread({ uri, depth });
        return jsonResponse(res.data);
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to get thread"));
      }
    },
  );

  // ─── Search users ───────────────────────────────────────────────

  server.registerTool(
    "bluesky_search_actors",
    {
      description: "Search for Bluesky users",
      inputSchema: {
        q: z.string().min(1).describe("Search query"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Number of results"),
      },
    },
    async ({ q, limit }) => {
      try {
        const agent = await getBlueskyAgent(getOrgId());
        const res = await agent.searchActors({ q, limit });
        return jsonResponse(res.data);
      } catch (error) {
        return errorResponse(
          errMsg(error, "Failed to search actors"),
        );
      }
    },
  );

  // ─── Delete post ────────────────────────────────────────────────

  server.registerTool(
    "bluesky_delete_post",
    {
      description: "Delete a Bluesky post",
      inputSchema: {
        uri: z
          .string()
          .min(1)
          .describe("AT URI of the post to delete"),
      },
    },
    async ({ uri }) => {
      try {
        const agent = await getBlueskyAgent(getOrgId());
        await agent.deletePost(uri);
        return jsonResponse({ success: true, deleted: uri });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to delete post"));
      }
    },
  );

  logger.debug("[BlueskyMCP] Registered 12 tools");
}

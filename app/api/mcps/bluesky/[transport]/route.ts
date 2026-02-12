/**
 * Bluesky MCP Server - Posts, Timeline, Notifications
 *
 * Standalone MCP endpoint for Bluesky tools with per-org AT Protocol OAuth.
 * Uses @atproto/api Agent for DPoP-authenticated API calls.
 * Config: { "type": "streamable-http", "url": "/api/mcps/bluesky/streamable-http" }
 */

import type { NextRequest } from "next/server";
import { logger } from "@/lib/utils/logger";
import { oauthService } from "@/lib/services/oauth";
import { getBlueskyAgent } from "@/lib/services/oauth/providers/bluesky-at";
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
  return (
    typeof resp === "object" &&
    resp !== null &&
    typeof (resp as McpHandlerResponse).status === "number"
  );
}

let mcpHandler: ((req: Request) => Promise<Response>) | null = null;

async function getBlueskyMcpHandler() {
  if (mcpHandler) return mcpHandler;

  const { createMcpHandler } = await import("mcp-handler");
  const { z } = await import("zod3");

  function getOrgId(): string {
    const ctx = authContextStorage.getStore();
    if (!ctx) throw new Error("Not authenticated");
    return ctx.user.organization_id;
  }

  function jsonResult(data: object) {
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data) }],
    };
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
      // ─── Connection status ──────────────────────────────────────────

      server.tool(
        "bluesky_status",
        "Check Bluesky OAuth connection status",
        {},
        async () => {
          try {
            const orgId = getOrgId();
            const connections = await oauthService.listConnections({
              organizationId: orgId,
              platform: "bluesky",
            });
            const active = connections.find(
              (c) => c.status === "active",
            );
            if (!active) {
              return jsonResult({
                connected: false,
                message:
                  "Bluesky not connected. Connect in Settings > Connections.",
              });
            }
            return jsonResult({
              connected: true,
              handle: active.username,
              did: active.platformUserId,
              displayName: active.displayName,
              scopes: active.scopes,
              linkedAt: active.linkedAt,
            });
          } catch (e) {
            return errorResult(
              e instanceof Error ? e.message : "Failed",
            );
          }
        },
      );

      // ─── Get profile ────────────────────────────────────────────────

      server.tool(
        "bluesky_get_profile",
        "Get a Bluesky user profile by handle or DID",
        {
          actor: z
            .string()
            .min(1)
            .describe("Handle (e.g., alice.bsky.social) or DID"),
        },
        async ({ actor }) => {
          try {
            const agent = await getBlueskyAgent(getOrgId());
            const res = await agent.getProfile({ actor });
            return jsonResult(res.data);
          } catch (e) {
            return errorResult(
              e instanceof Error ? e.message : "Failed",
            );
          }
        },
      );

      // ─── Create post ────────────────────────────────────────────────

      server.tool(
        "bluesky_create_post",
        "Create a Bluesky post (max 300 characters)",
        {
          text: z
            .string()
            .min(1)
            .max(300)
            .describe("Post text content"),
        },
        async ({ text }) => {
          try {
            const agent = await getBlueskyAgent(getOrgId());
            const res = await agent.post({ text });
            return jsonResult(res);
          } catch (e) {
            return errorResult(
              e instanceof Error ? e.message : "Failed",
            );
          }
        },
      );

      // ─── Get timeline ───────────────────────────────────────────────

      server.tool(
        "bluesky_get_timeline",
        "Get home timeline feed",
        {
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
        async ({ limit, cursor }) => {
          try {
            const agent = await getBlueskyAgent(getOrgId());
            const res = await agent.getTimeline({ limit, cursor });
            return jsonResult(res.data);
          } catch (e) {
            return errorResult(
              e instanceof Error ? e.message : "Failed",
            );
          }
        },
      );

      // ─── Search posts ───────────────────────────────────────────────

      server.tool(
        "bluesky_search_posts",
        "Search Bluesky posts",
        {
          q: z.string().min(1).describe("Search query"),
          limit: z
            .number()
            .int()
            .min(1)
            .max(100)
            .optional()
            .describe("Number of results"),
        },
        async ({ q, limit }) => {
          try {
            const agent = await getBlueskyAgent(getOrgId());
            const res = await agent.app.bsky.feed.searchPosts({
              q,
              limit,
            });
            return jsonResult(res.data);
          } catch (e) {
            return errorResult(
              e instanceof Error ? e.message : "Failed",
            );
          }
        },
      );

      // ─── Like post ──────────────────────────────────────────────────

      server.tool(
        "bluesky_like_post",
        "Like a Bluesky post",
        {
          uri: z.string().min(1).describe("AT URI of the post"),
          cid: z.string().min(1).describe("CID of the post"),
        },
        async ({ uri, cid }) => {
          try {
            const agent = await getBlueskyAgent(getOrgId());
            const res = await agent.like(uri, cid);
            return jsonResult(res);
          } catch (e) {
            return errorResult(
              e instanceof Error ? e.message : "Failed",
            );
          }
        },
      );

      // ─── Repost ─────────────────────────────────────────────────────

      server.tool(
        "bluesky_repost",
        "Repost a Bluesky post",
        {
          uri: z.string().min(1).describe("AT URI of the post"),
          cid: z.string().min(1).describe("CID of the post"),
        },
        async ({ uri, cid }) => {
          try {
            const agent = await getBlueskyAgent(getOrgId());
            const res = await agent.repost(uri, cid);
            return jsonResult(res);
          } catch (e) {
            return errorResult(
              e instanceof Error ? e.message : "Failed",
            );
          }
        },
      );

      // ─── Follow user ───────────────────────────────────────────────

      server.tool(
        "bluesky_follow",
        "Follow a Bluesky user",
        {
          did: z.string().min(1).describe("DID of the user to follow"),
        },
        async ({ did }) => {
          try {
            const agent = await getBlueskyAgent(getOrgId());
            const res = await agent.follow(did);
            return jsonResult(res);
          } catch (e) {
            return errorResult(
              e instanceof Error ? e.message : "Failed",
            );
          }
        },
      );

      // ─── Get notifications ──────────────────────────────────────────

      server.tool(
        "bluesky_get_notifications",
        "Get notifications (likes, follows, replies, mentions)",
        {
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
        async ({ limit, cursor }) => {
          try {
            const agent = await getBlueskyAgent(getOrgId());
            const res = await agent.listNotifications({ limit, cursor });
            return jsonResult(res.data);
          } catch (e) {
            return errorResult(
              e instanceof Error ? e.message : "Failed",
            );
          }
        },
      );

      // ─── Get post thread ────────────────────────────────────────────

      server.tool(
        "bluesky_get_thread",
        "Get a post thread with replies",
        {
          uri: z.string().min(1).describe("AT URI of the post"),
          depth: z
            .number()
            .int()
            .min(0)
            .max(10)
            .optional()
            .describe("Reply depth (default 6)"),
        },
        async ({ uri, depth }) => {
          try {
            const agent = await getBlueskyAgent(getOrgId());
            const res = await agent.getPostThread({ uri, depth });
            return jsonResult(res.data);
          } catch (e) {
            return errorResult(
              e instanceof Error ? e.message : "Failed",
            );
          }
        },
      );

      // ─── Search users ───────────────────────────────────────────────

      server.tool(
        "bluesky_search_actors",
        "Search for Bluesky users",
        {
          q: z.string().min(1).describe("Search query"),
          limit: z
            .number()
            .int()
            .min(1)
            .max(100)
            .optional()
            .describe("Number of results"),
        },
        async ({ q, limit }) => {
          try {
            const agent = await getBlueskyAgent(getOrgId());
            const res = await agent.searchActors({ q, limit });
            return jsonResult(res.data);
          } catch (e) {
            return errorResult(
              e instanceof Error ? e.message : "Failed",
            );
          }
        },
      );

      // ─── Delete post ────────────────────────────────────────────────

      server.tool(
        "bluesky_delete_post",
        "Delete a Bluesky post",
        {
          uri: z.string().min(1).describe("AT URI of the post to delete"),
        },
        async ({ uri }) => {
          try {
            const agent = await getBlueskyAgent(getOrgId());
            await agent.deletePost(uri);
            return jsonResult({ success: true, deleted: uri });
          } catch (e) {
            return errorResult(
              e instanceof Error ? e.message : "Failed",
            );
          }
        },
      );
    },
    { capabilities: { tools: {} } },
    { basePath: "/api/mcps/bluesky", maxDuration: 60 },
  );

  return mcpHandler;
}

async function handleRequest(req: NextRequest): Promise<Response> {
  try {
    const authResult = await requireAuthOrApiKeyWithOrg(req);

    const rateLimitKey = `mcp:ratelimit:bluesky:${authResult.user.organization_id}`;
    const rateLimit = await checkRateLimitRedis(rateLimitKey, 60000, 100);
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({ error: "rate_limit_exceeded" }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );
    }

    const handler = await getBlueskyMcpHandler();
    const mcpResponse = await authContextStorage.run(authResult, () =>
      handler(req as Request),
    );

    if (!mcpResponse || !isMcpHandlerResponse(mcpResponse)) {
      return new Response(
        JSON.stringify({ error: "invalid_response" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const bodyText = mcpResponse.text ? await mcpResponse.text() : "";
    const headers: Record<string, string> = {};
    mcpResponse.headers?.forEach((v: string, k: string) => {
      headers[k] = v;
    });

    return new Response(bodyText, {
      status: mcpResponse.status,
      headers,
    });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Unknown error";
    logger.error(`[BlueskyMCP] ${msg}`);
    const isAuth =
      msg.includes("API key") ||
      msg.includes("auth") ||
      msg.includes("Unauthorized");
    return new Response(
      JSON.stringify({
        error: isAuth ? "authentication_required" : "internal_error",
        message: msg,
      }),
      {
        status: isAuth ? 401 : 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export const GET = handleRequest;
export const POST = handleRequest;
export const DELETE = handleRequest;

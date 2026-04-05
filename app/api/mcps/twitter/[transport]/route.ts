// @ts-nocheck — MCP tool types cause exponential type inference
/**
 * Twitter/X MCP Server - Tweets, Users, Engagement
 *
 * Standalone MCP endpoint for Twitter tools with per-org OAuth 1.0a.
 * Config: { "type": "streamable-http", "url": "/api/mcps/twitter/streamable-http" }
 *
 * Uses twitter-api-v2 library which handles OAuth 1.0a request signing.
 * Requires platform env vars TWITTER_API_KEY + TWITTER_API_SECRET_KEY
 * and per-org secrets TWITTER_ACCESS_TOKEN + TWITTER_ACCESS_TOKEN_SECRET.
 */

import type { NextRequest } from "next/server";
import { authContextStorage } from "@/app/api/mcp/lib/context";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { checkRateLimitRedis } from "@/lib/middleware/rate-limit-redis";
import { oauthService } from "@/lib/services/oauth";
import { logger } from "@/lib/utils/logger";

export const maxDuration = 60;

const TWITTER_API_KEY = process.env.TWITTER_API_KEY || "";
const TWITTER_API_SECRET_KEY = process.env.TWITTER_API_SECRET_KEY || "";

const USER_ID_CACHE_TTL_MS = 5 * 60 * 1000;
const USER_ID_CACHE_MAX_SIZE = 100;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 100;

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

async function getTwitterMcpHandler() {
  if (mcpHandler) return mcpHandler;

  const { createMcpHandler } = await import("mcp-handler");
  const { z } = await import("zod3");
  const { TwitterApi } = await import("twitter-api-v2");

  async function getTwitterClient(organizationId: string) {
    if (!TWITTER_API_KEY || !TWITTER_API_SECRET_KEY) {
      throw new Error(
        "Twitter API credentials not configured at platform level. Set TWITTER_API_KEY and TWITTER_API_SECRET_KEY.",
      );
    }

    const user = getAuthUser();
    const result = await oauthService.getValidTokenByPlatform({
      organizationId,
      userId: user.id,
      platform: "twitter",
    });

    return new TwitterApi({
      appKey: TWITTER_API_KEY,
      appSecret: TWITTER_API_SECRET_KEY,
      accessToken: result.accessToken,
      accessSecret: result.accessTokenSecret || "",
    });
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
      content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }],
      isError: true,
    };
  }

  function errMsg(error: unknown, fallback: string): string {
    if (!(error instanceof Error)) return fallback;
    const err = error as Error & {
      code?: number;
      data?: { detail?: string; title?: string; status?: number };
      rateLimit?: { remaining?: number; reset?: number };
    };
    const parts: string[] = [err.message];
    if (err.data?.detail) parts.push(err.data.detail);
    if (err.code) parts.push(`code: ${err.code}`);
    if (err.rateLimit?.remaining === 0 && err.rateLimit?.reset) {
      parts.push(`rate limit resets at ${new Date(err.rateLimit.reset * 1000).toISOString()}`);
    }
    return parts.join(" — ");
  }

  const userIdCache = new Map<string, { id: string; expiry: number }>();

  function pruneExpiredCacheEntries(): void {
    const now = Date.now();
    for (const [key, value] of userIdCache) {
      if (now >= value.expiry) userIdCache.delete(key);
    }
  }

  async function getAuthenticatedUserId(
    client: InstanceType<typeof TwitterApi>,
    orgId: string,
  ): Promise<string> {
    const cached = userIdCache.get(orgId);
    if (cached && Date.now() < cached.expiry) return cached.id;
    const me = await client.v2.me();
    if (userIdCache.size >= USER_ID_CACHE_MAX_SIZE) pruneExpiredCacheEntries();
    if (userIdCache.size >= USER_ID_CACHE_MAX_SIZE) {
      const oldestKey = userIdCache.keys().next().value;
      if (oldestKey) userIdCache.delete(oldestKey);
    }
    userIdCache.set(orgId, { id: me.data.id, expiry: Date.now() + USER_ID_CACHE_TTL_MS });
    return me.data.id;
  }

  mcpHandler = createMcpHandler(
    (server) => {
      // --- Connection status ---
      server.tool("twitter_status", "Check Twitter/X OAuth connection status", {}, async () => {
        try {
          const orgId = getOrgId();
          const connections = await oauthService.listConnections({
            organizationId: orgId,
            userId: getAuthUser().id,
            platform: "twitter",
          });
          const active = connections.find((c) => c.status === "active");
          if (!active) return jsonResult({ connected: false });
          return jsonResult({
            connected: true,
            username: active.displayName,
            scopes: active.scopes,
          });
        } catch (e) {
          return errorResult(errMsg(e, "Failed"));
        }
      });

      // --- Get authenticated user profile ---
      server.tool(
        "twitter_get_me",
        "Get the authenticated Twitter/X user's profile information",
        {},
        async () => {
          try {
            const orgId = getOrgId();
            const client = await getTwitterClient(orgId);
            const me = await client.v2.me({
              "user.fields": [
                "description",
                "public_metrics",
                "profile_image_url",
                "created_at",
                "location",
                "url",
                "verified",
              ],
            });
            return jsonResult({
              id: me.data.id,
              username: me.data.username,
              name: me.data.name,
              description: me.data.description,
              profileImageUrl: me.data.profile_image_url,
              publicMetrics: me.data.public_metrics,
              createdAt: me.data.created_at,
              location: me.data.location,
              url: me.data.url,
              verified: me.data.verified,
            });
          } catch (e) {
            return errorResult(errMsg(e, "Failed to get profile"));
          }
        },
      );

      // --- Get user by username ---
      server.tool(
        "twitter_get_user",
        "Get a Twitter/X user's profile by their username (handle)",
        {
          username: z.string().describe("The Twitter username/handle (without @)"),
        },
        async ({ username }) => {
          try {
            const orgId = getOrgId();
            const client = await getTwitterClient(orgId);
            const user = await client.v2.userByUsername(username, {
              "user.fields": [
                "description",
                "public_metrics",
                "profile_image_url",
                "created_at",
                "location",
                "url",
                "verified",
              ],
            });
            if (!user.data) return errorResult(`User @${username} not found`);
            return jsonResult({
              id: user.data.id,
              username: user.data.username,
              name: user.data.name,
              description: user.data.description,
              profileImageUrl: user.data.profile_image_url,
              publicMetrics: user.data.public_metrics,
              createdAt: user.data.created_at,
              location: user.data.location,
              url: user.data.url,
              verified: user.data.verified,
            });
          } catch (e) {
            return errorResult(errMsg(e, "Failed to get user"));
          }
        },
      );

      // --- Create tweet ---
      server.tool(
        "twitter_create_tweet",
        "Post a new tweet on Twitter/X. Supports text tweets and replies.",
        {
          text: z.string().min(1).max(280).describe("The tweet text content (max 280 characters)"),
          replyToTweetId: z
            .string()
            .regex(/^\d+$/)
            .optional()
            .describe("Tweet ID to reply to (makes this a reply)"),
          quoteTweetId: z
            .string()
            .regex(/^\d+$/)
            .optional()
            .describe("Tweet ID to quote (makes this a quote tweet)"),
        },
        async ({ text, replyToTweetId, quoteTweetId }) => {
          try {
            const orgId = getOrgId();
            const client = await getTwitterClient(orgId);

            const params: Record<string, unknown> = {};
            if (replyToTweetId) {
              params.reply = { in_reply_to_tweet_id: replyToTweetId };
            }
            if (quoteTweetId) {
              params.quote_tweet_id = quoteTweetId;
            }

            const tweet = await client.v2.tweet(text, params);

            return jsonResult({
              success: true,
              tweetId: tweet.data.id,
              text: tweet.data.text,
            });
          } catch (e) {
            return errorResult(errMsg(e, "Failed to create tweet"));
          }
        },
      );

      // --- Delete tweet ---
      server.tool(
        "twitter_delete_tweet",
        "Delete a tweet by its ID. Only works for tweets by the authenticated user.",
        {
          tweetId: z.string().regex(/^\d+$/).describe("The ID of the tweet to delete"),
        },
        async ({ tweetId }) => {
          try {
            const orgId = getOrgId();
            const client = await getTwitterClient(orgId);
            const result = await client.v2.deleteTweet(tweetId);
            return jsonResult({ success: true, deleted: result.data.deleted, tweetId });
          } catch (e) {
            return errorResult(errMsg(e, "Failed to delete tweet"));
          }
        },
      );

      // --- Get tweet by ID ---
      server.tool(
        "twitter_get_tweet",
        "Get a specific tweet by its ID with full details",
        {
          tweetId: z.string().regex(/^\d+$/).describe("The ID of the tweet to retrieve"),
        },
        async ({ tweetId }) => {
          try {
            const orgId = getOrgId();
            const client = await getTwitterClient(orgId);
            const tweet = await client.v2.singleTweet(tweetId, {
              "tweet.fields": [
                "created_at",
                "public_metrics",
                "author_id",
                "conversation_id",
                "in_reply_to_user_id",
                "referenced_tweets",
                "entities",
              ],
              expansions: ["author_id"],
              "user.fields": ["username", "name", "profile_image_url"],
            });
            return jsonResult({
              id: tweet.data.id,
              text: tweet.data.text,
              authorId: tweet.data.author_id,
              createdAt: tweet.data.created_at,
              publicMetrics: tweet.data.public_metrics,
              conversationId: tweet.data.conversation_id,
              referencedTweets: tweet.data.referenced_tweets,
              entities: tweet.data.entities,
              includes: tweet.includes,
            });
          } catch (e) {
            return errorResult(errMsg(e, "Failed to get tweet"));
          }
        },
      );

      // --- Search recent tweets ---
      server.tool(
        "twitter_search_tweets",
        "Search for recent tweets matching a query. Uses Twitter API v2 recent search (last 7 days).",
        {
          query: z.string().describe("The search query (supports Twitter search operators)"),
          maxResults: z
            .number()
            .min(10)
            .max(100)
            .optional()
            .describe("Number of results to return (10-100, default 10)"),
        },
        async ({ query, maxResults = 10 }) => {
          try {
            const orgId = getOrgId();
            const client = await getTwitterClient(orgId);
            const results = await client.v2.search(query, {
              max_results: maxResults,
              "tweet.fields": ["created_at", "public_metrics", "author_id", "entities"],
              expansions: ["author_id"],
              "user.fields": ["username", "name"],
            });

            const tweets = results.data?.data || [];
            return jsonResult({
              query,
              resultCount: tweets.length,
              tweets: tweets.map((t) => ({
                id: t.id,
                text: t.text,
                authorId: t.author_id,
                createdAt: t.created_at,
                publicMetrics: t.public_metrics,
              })),
              includes: results.data?.includes,
            });
          } catch (e) {
            return errorResult(errMsg(e, "Failed to search tweets"));
          }
        },
      );

      // --- Get user's tweets (timeline) ---
      server.tool(
        "twitter_get_user_tweets",
        "Get recent tweets posted by a specific user",
        {
          userId: z.string().regex(/^\d+$/).describe("The Twitter user ID"),
          maxResults: z
            .number()
            .min(5)
            .max(100)
            .optional()
            .describe("Number of tweets to return (5-100, default 10)"),
        },
        async ({ userId, maxResults = 10 }) => {
          try {
            const orgId = getOrgId();
            const client = await getTwitterClient(orgId);
            const timeline = await client.v2.userTimeline(userId, {
              max_results: maxResults,
              "tweet.fields": ["created_at", "public_metrics", "entities", "referenced_tweets"],
            });

            const tweets = timeline.data?.data || [];
            return jsonResult({
              userId,
              resultCount: tweets.length,
              tweets: tweets.map((t) => ({
                id: t.id,
                text: t.text,
                createdAt: t.created_at,
                publicMetrics: t.public_metrics,
                referencedTweets: t.referenced_tweets,
              })),
            });
          } catch (e) {
            return errorResult(errMsg(e, "Failed to get user tweets"));
          }
        },
      );

      // --- Like a tweet ---
      server.tool(
        "twitter_like_tweet",
        "Like a tweet on behalf of the authenticated user",
        {
          tweetId: z.string().regex(/^\d+$/).describe("The ID of the tweet to like"),
        },
        async ({ tweetId }) => {
          try {
            const orgId = getOrgId();
            const client = await getTwitterClient(orgId);
            const userId = await getAuthenticatedUserId(client, orgId);
            const result = await client.v2.like(userId, tweetId);
            return jsonResult({ success: true, liked: result.data.liked, tweetId });
          } catch (e) {
            return errorResult(errMsg(e, "Failed to like tweet"));
          }
        },
      );

      // --- Unlike a tweet ---
      server.tool(
        "twitter_unlike_tweet",
        "Remove a like from a tweet",
        {
          tweetId: z.string().regex(/^\d+$/).describe("The ID of the tweet to unlike"),
        },
        async ({ tweetId }) => {
          try {
            const orgId = getOrgId();
            const client = await getTwitterClient(orgId);
            const userId = await getAuthenticatedUserId(client, orgId);
            const result = await client.v2.unlike(userId, tweetId);
            return jsonResult({ success: true, liked: result.data.liked, tweetId });
          } catch (e) {
            return errorResult(errMsg(e, "Failed to unlike tweet"));
          }
        },
      );

      // --- Retweet ---
      server.tool(
        "twitter_retweet",
        "Retweet a tweet on behalf of the authenticated user",
        {
          tweetId: z.string().regex(/^\d+$/).describe("The ID of the tweet to retweet"),
        },
        async ({ tweetId }) => {
          try {
            const orgId = getOrgId();
            const client = await getTwitterClient(orgId);
            const userId = await getAuthenticatedUserId(client, orgId);
            const result = await client.v2.retweet(userId, tweetId);
            return jsonResult({ success: true, retweeted: result.data.retweeted, tweetId });
          } catch (e) {
            return errorResult(errMsg(e, "Failed to retweet"));
          }
        },
      );

      // --- Unretweet ---
      server.tool(
        "twitter_unretweet",
        "Remove a retweet from a tweet",
        {
          tweetId: z.string().regex(/^\d+$/).describe("The ID of the tweet to unretweet"),
        },
        async ({ tweetId }) => {
          try {
            const orgId = getOrgId();
            const client = await getTwitterClient(orgId);
            const userId = await getAuthenticatedUserId(client, orgId);
            const result = await client.v2.unretweet(userId, tweetId);
            return jsonResult({ success: true, retweeted: result.data.retweeted, tweetId });
          } catch (e) {
            return errorResult(errMsg(e, "Failed to unretweet"));
          }
        },
      );

      // --- Get followers ---
      server.tool(
        "twitter_get_followers",
        "Get a list of users who follow the specified user",
        {
          userId: z.string().regex(/^\d+$/).describe("The Twitter user ID to get followers for"),
          maxResults: z
            .number()
            .min(1)
            .max(100)
            .optional()
            .describe("Number of followers to return (1-100, default 20)"),
        },
        async ({ userId, maxResults = 20 }) => {
          try {
            const orgId = getOrgId();
            const client = await getTwitterClient(orgId);
            const followers = await client.v2.followers(userId, {
              max_results: maxResults,
              "user.fields": ["description", "public_metrics", "profile_image_url", "verified"],
            });

            const users = followers.data?.data || [];
            return jsonResult({
              userId,
              resultCount: users.length,
              followers: users.map((u) => ({
                id: u.id,
                username: u.username,
                name: u.name,
                description: u.description,
                publicMetrics: u.public_metrics,
                verified: u.verified,
              })),
            });
          } catch (e) {
            return errorResult(errMsg(e, "Failed to get followers"));
          }
        },
      );

      // --- Get following ---
      server.tool(
        "twitter_get_following",
        "Get a list of users that the specified user is following",
        {
          userId: z
            .string()
            .regex(/^\d+$/)
            .describe("The Twitter user ID to get following list for"),
          maxResults: z
            .number()
            .min(1)
            .max(100)
            .optional()
            .describe("Number of users to return (1-100, default 20)"),
        },
        async ({ userId, maxResults = 20 }) => {
          try {
            const orgId = getOrgId();
            const client = await getTwitterClient(orgId);
            const following = await client.v2.following(userId, {
              max_results: maxResults,
              "user.fields": ["description", "public_metrics", "profile_image_url", "verified"],
            });

            const users = following.data?.data || [];
            return jsonResult({
              userId,
              resultCount: users.length,
              following: users.map((u) => ({
                id: u.id,
                username: u.username,
                name: u.name,
                description: u.description,
                publicMetrics: u.public_metrics,
                verified: u.verified,
              })),
            });
          } catch (e) {
            return errorResult(errMsg(e, "Failed to get following"));
          }
        },
      );

      // --- Follow user ---
      server.tool(
        "twitter_follow_user",
        "Follow a user on Twitter/X",
        {
          targetUserId: z.string().regex(/^\d+$/).describe("The user ID of the account to follow"),
        },
        async ({ targetUserId }) => {
          try {
            const orgId = getOrgId();
            const client = await getTwitterClient(orgId);
            const userId = await getAuthenticatedUserId(client, orgId);
            const result = await client.v2.follow(userId, targetUserId);
            return jsonResult({
              success: true,
              following: result.data.following,
              pendingFollow: result.data.pending_follow,
              targetUserId,
            });
          } catch (e) {
            return errorResult(errMsg(e, "Failed to follow user"));
          }
        },
      );

      // --- Unfollow user ---
      server.tool(
        "twitter_unfollow_user",
        "Unfollow a user on Twitter/X",
        {
          targetUserId: z
            .string()
            .regex(/^\d+$/)
            .describe("The user ID of the account to unfollow"),
        },
        async ({ targetUserId }) => {
          try {
            const orgId = getOrgId();
            const client = await getTwitterClient(orgId);
            const userId = await getAuthenticatedUserId(client, orgId);
            const result = await client.v2.unfollow(userId, targetUserId);
            return jsonResult({ success: true, following: result.data.following, targetUserId });
          } catch (e) {
            return errorResult(errMsg(e, "Failed to unfollow user"));
          }
        },
      );
    },
    { capabilities: { tools: {} } },
    {
      streamableHttpEndpoint: "/api/mcps/twitter/streamable-http",
      disableSse: true,
      maxDuration: 60,
    },
  );

  return mcpHandler;
}

async function handleRequest(
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

  try {
    const authResult = await requireAuthOrApiKeyWithOrg(req);

    const rateLimitKey = `mcp:ratelimit:twitter:${authResult.user.organization_id}`;
    const rateLimit = await checkRateLimitRedis(
      rateLimitKey,
      RATE_LIMIT_WINDOW_MS,
      RATE_LIMIT_MAX_REQUESTS,
    );
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ error: "rate_limit_exceeded" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }

    const handler = await getTwitterMcpHandler();
    const mcpResponse = await authContextStorage.run(authResult, () => handler(req as Request));

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
    const msg = error instanceof Error ? error.message : "Unknown error";
    logger.error(`[TwitterMCP] ${msg}`);
    const isAuth = msg.includes("API key") || msg.includes("auth") || msg.includes("Unauthorized");
    return new Response(
      JSON.stringify({
        error: isAuth ? "authentication_required" : "internal_error",
        message: msg,
      }),
      { status: isAuth ? 401 : 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

export const GET = handleRequest;
export const POST = handleRequest;
export const DELETE = handleRequest;

/**
 * Twitter/X MCP Tools - Tweets, Users, Engagement
 * Uses per-organization OAuth 1.0a tokens via oauthService + twitter-api-v2.
 *
 * Requires platform env vars TWITTER_API_KEY + TWITTER_API_SECRET_KEY
 * and per-org secrets TWITTER_ACCESS_TOKEN + TWITTER_ACCESS_TOKEN_SECRET.
 */

import type { McpServer } from "mcp-handler";
import { z } from "zod3";
import { TwitterApi } from "twitter-api-v2";
import { logger } from "@/lib/utils/logger";
import { oauthService } from "@/lib/services/oauth";
import { getAuthContext } from "../lib/context";
import { jsonResponse, errorResponse } from "../lib/responses";

const TWITTER_API_KEY = process.env.TWITTER_API_KEY || "";
const TWITTER_API_SECRET_KEY = process.env.TWITTER_API_SECRET_KEY || "";

const USER_ID_CACHE_TTL_MS = 5 * 60 * 1000;
const USER_ID_CACHE_MAX_SIZE = 100;

async function getTwitterClient(): Promise<TwitterApi> {
  if (!TWITTER_API_KEY || !TWITTER_API_SECRET_KEY) {
    throw new Error("Twitter API credentials not configured at platform level. Set TWITTER_API_KEY and TWITTER_API_SECRET_KEY.");
  }

  const { user } = getAuthContext();

  try {
    const result = await oauthService.getValidTokenByPlatform({
      organizationId: user.organization_id,
      platform: "twitter",
    });

    return new TwitterApi({
      appKey: TWITTER_API_KEY,
      appSecret: TWITTER_API_SECRET_KEY,
      accessToken: result.accessToken,
      accessSecret: result.accessTokenSecret || "",
    });
  } catch (error) {
    logger.warn("[TwitterMCP] Failed to get token", {
      organizationId: user.organization_id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error("Twitter account not connected. Connect in Settings > Connections.");
  }
}

const userIdCache = new Map<string, { id: string; expiry: number }>();

function pruneExpiredCacheEntries(): void {
  const now = Date.now();
  for (const [key, value] of userIdCache) {
    if (now >= value.expiry) userIdCache.delete(key);
  }
}

async function getAuthenticatedUserId(client: TwitterApi): Promise<string> {
  const { user } = getAuthContext();
  const orgId = user.organization_id;
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

function errMsg(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const err = error as Error & { code?: number; data?: { detail?: string; title?: string; status?: number }; rateLimit?: { remaining?: number; reset?: number } };
  const parts: string[] = [err.message];
  if (err.data?.detail) parts.push(err.data.detail);
  if (err.code) parts.push(`code: ${err.code}`);
  if (err.rateLimit?.remaining === 0 && err.rateLimit?.reset) {
    parts.push(`rate limit resets at ${new Date(err.rateLimit.reset * 1000).toISOString()}`);
  }
  return parts.join(" — ");
}

export function registerTwitterTools(server: McpServer): void {
  // --- Connection status ---
  server.registerTool(
    "twitter_status",
    {
      description: "Check Twitter/X OAuth connection status",
      inputSchema: {},
    },
    async () => {
      try {
        const { user } = getAuthContext();
        const connections = await oauthService.listConnections({
          organizationId: user.organization_id,
          platform: "twitter",
        });
        const active = connections.find((c) => c.status === "active");
        if (!active) {
          return jsonResponse({
            connected: false,
            message: "Twitter not connected. Connect in Settings > Connections.",
          });
        }
        return jsonResponse({
          connected: true,
          username: active.displayName,
          scopes: active.scopes,
          linkedAt: active.linkedAt,
        });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to check status"));
      }
    },
  );

  // --- Get authenticated user profile ---
  server.registerTool(
    "twitter_get_me",
    {
      description: "Get the authenticated Twitter/X user's profile information",
      inputSchema: {},
    },
    async () => {
      try {
        const client = await getTwitterClient();
        const me = await client.v2.me({
          "user.fields": ["description", "public_metrics", "profile_image_url", "created_at", "location", "url", "verified"],
        });
        return jsonResponse({
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
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to get profile"));
      }
    },
  );

  // --- Get user by username ---
  server.registerTool(
    "twitter_get_user",
    {
      description: "Get a Twitter/X user's profile by their username (handle)",
      inputSchema: {
        username: z.string().describe("The Twitter username/handle (without @)"),
      },
    },
    async ({ username }) => {
      try {
        const client = await getTwitterClient();
        const user = await client.v2.userByUsername(username, {
          "user.fields": ["description", "public_metrics", "profile_image_url", "created_at", "location", "url", "verified"],
        });
        if (!user.data) return errorResponse(`User @${username} not found`);
        return jsonResponse({
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
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to get user"));
      }
    },
  );

  // --- Create tweet ---
  server.registerTool(
    "twitter_create_tweet",
    {
      description: "Post a new tweet on Twitter/X. Supports text tweets and replies.",
      inputSchema: {
        text: z.string().min(1).max(280).describe("The tweet text content (max 280 characters)"),
        replyToTweetId: z.string().regex(/^\d+$/).optional().describe("Tweet ID to reply to (makes this a reply)"),
        quoteTweetId: z.string().regex(/^\d+$/).optional().describe("Tweet ID to quote (makes this a quote tweet)"),
      },
    },
    async ({ text, replyToTweetId, quoteTweetId }) => {
      try {
        const client = await getTwitterClient();

        const params: Record<string, unknown> = {};
        if (replyToTweetId) {
          params.reply = { in_reply_to_tweet_id: replyToTweetId };
        }
        if (quoteTweetId) {
          params.quote_tweet_id = quoteTweetId;
        }

        const tweet = await client.v2.tweet(text, params);

        logger.info("[TwitterMCP] Tweet created", { tweetId: tweet.data.id });

        return jsonResponse({
          success: true,
          tweetId: tweet.data.id,
          text: tweet.data.text,
        });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to create tweet"));
      }
    },
  );

  // --- Delete tweet ---
  server.registerTool(
    "twitter_delete_tweet",
    {
      description: "Delete a tweet by its ID. Only works for tweets by the authenticated user.",
      inputSchema: {
        tweetId: z.string().regex(/^\d+$/).describe("The ID of the tweet to delete"),
      },
    },
    async ({ tweetId }) => {
      try {
        const client = await getTwitterClient();
        const result = await client.v2.deleteTweet(tweetId);
        return jsonResponse({ success: true, deleted: result.data.deleted, tweetId });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to delete tweet"));
      }
    },
  );

  // --- Get tweet by ID ---
  server.registerTool(
    "twitter_get_tweet",
    {
      description: "Get a specific tweet by its ID with full details",
      inputSchema: {
        tweetId: z.string().regex(/^\d+$/).describe("The ID of the tweet to retrieve"),
      },
    },
    async ({ tweetId }) => {
      try {
        const client = await getTwitterClient();
        const tweet = await client.v2.singleTweet(tweetId, {
          "tweet.fields": ["created_at", "public_metrics", "author_id", "conversation_id", "in_reply_to_user_id", "referenced_tweets", "entities"],
          expansions: ["author_id"],
          "user.fields": ["username", "name", "profile_image_url"],
        });
        return jsonResponse({
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
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to get tweet"));
      }
    },
  );

  // --- Search recent tweets ---
  server.registerTool(
    "twitter_search_tweets",
    {
      description: "Search for recent tweets matching a query. Uses Twitter API v2 recent search (last 7 days).",
      inputSchema: {
        query: z.string().describe("The search query (supports Twitter search operators)"),
        maxResults: z.number().min(10).max(100).optional().describe("Number of results to return (10-100, default 10)"),
      },
    },
    async ({ query, maxResults = 10 }) => {
      try {
        const client = await getTwitterClient();
        const results = await client.v2.search(query, {
          max_results: maxResults,
          "tweet.fields": ["created_at", "public_metrics", "author_id", "entities"],
          expansions: ["author_id"],
          "user.fields": ["username", "name"],
        });

        const tweets = results.data?.data || [];
        return jsonResponse({
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
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to search tweets"));
      }
    },
  );

  // --- Get user's tweets (timeline) ---
  server.registerTool(
    "twitter_get_user_tweets",
    {
      description: "Get recent tweets posted by a specific user",
      inputSchema: {
        userId: z.string().regex(/^\d+$/).describe("The Twitter user ID"),
        maxResults: z.number().min(5).max(100).optional().describe("Number of tweets to return (5-100, default 10)"),
      },
    },
    async ({ userId, maxResults = 10 }) => {
      try {
        const client = await getTwitterClient();
        const timeline = await client.v2.userTimeline(userId, {
          max_results: maxResults,
          "tweet.fields": ["created_at", "public_metrics", "entities", "referenced_tweets"],
        });

        const tweets = timeline.data?.data || [];
        return jsonResponse({
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
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to get user tweets"));
      }
    },
  );

  // --- Like a tweet ---
  server.registerTool(
    "twitter_like_tweet",
    {
      description: "Like a tweet on behalf of the authenticated user",
      inputSchema: {
        tweetId: z.string().regex(/^\d+$/).describe("The ID of the tweet to like"),
      },
    },
    async ({ tweetId }) => {
      try {
        const client = await getTwitterClient();
        const userId = await getAuthenticatedUserId(client);
        const result = await client.v2.like(userId, tweetId);
        return jsonResponse({ success: true, liked: result.data.liked, tweetId });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to like tweet"));
      }
    },
  );

  // --- Unlike a tweet ---
  server.registerTool(
    "twitter_unlike_tweet",
    {
      description: "Remove a like from a tweet",
      inputSchema: {
        tweetId: z.string().regex(/^\d+$/).describe("The ID of the tweet to unlike"),
      },
    },
    async ({ tweetId }) => {
      try {
        const client = await getTwitterClient();
        const userId = await getAuthenticatedUserId(client);
        const result = await client.v2.unlike(userId, tweetId);
        return jsonResponse({ success: true, liked: result.data.liked, tweetId });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to unlike tweet"));
      }
    },
  );

  // --- Retweet ---
  server.registerTool(
    "twitter_retweet",
    {
      description: "Retweet a tweet on behalf of the authenticated user",
      inputSchema: {
        tweetId: z.string().regex(/^\d+$/).describe("The ID of the tweet to retweet"),
      },
    },
    async ({ tweetId }) => {
      try {
        const client = await getTwitterClient();
        const userId = await getAuthenticatedUserId(client);
        const result = await client.v2.retweet(userId, tweetId);
        return jsonResponse({ success: true, retweeted: result.data.retweeted, tweetId });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to retweet"));
      }
    },
  );

  // --- Unretweet ---
  server.registerTool(
    "twitter_unretweet",
    {
      description: "Remove a retweet from a tweet",
      inputSchema: {
        tweetId: z.string().regex(/^\d+$/).describe("The ID of the tweet to unretweet"),
      },
    },
    async ({ tweetId }) => {
      try {
        const client = await getTwitterClient();
        const userId = await getAuthenticatedUserId(client);
        const result = await client.v2.unretweet(userId, tweetId);
        return jsonResponse({ success: true, retweeted: result.data.retweeted, tweetId });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to unretweet"));
      }
    },
  );

  // --- Get followers ---
  server.registerTool(
    "twitter_get_followers",
    {
      description: "Get a list of users who follow the specified user",
      inputSchema: {
        userId: z.string().regex(/^\d+$/).describe("The Twitter user ID to get followers for"),
        maxResults: z.number().min(1).max(100).optional().describe("Number of followers to return (1-100, default 20)"),
      },
    },
    async ({ userId, maxResults = 20 }) => {
      try {
        const client = await getTwitterClient();
        const followers = await client.v2.followers(userId, {
          max_results: maxResults,
          "user.fields": ["description", "public_metrics", "profile_image_url", "verified"],
        });

        const users = followers.data?.data || [];
        return jsonResponse({
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
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to get followers"));
      }
    },
  );

  // --- Get following ---
  server.registerTool(
    "twitter_get_following",
    {
      description: "Get a list of users that the specified user is following",
      inputSchema: {
        userId: z.string().regex(/^\d+$/).describe("The Twitter user ID to get following list for"),
        maxResults: z.number().min(1).max(100).optional().describe("Number of users to return (1-100, default 20)"),
      },
    },
    async ({ userId, maxResults = 20 }) => {
      try {
        const client = await getTwitterClient();
        const following = await client.v2.following(userId, {
          max_results: maxResults,
          "user.fields": ["description", "public_metrics", "profile_image_url", "verified"],
        });

        const users = following.data?.data || [];
        return jsonResponse({
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
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to get following"));
      }
    },
  );

  // --- Follow user ---
  server.registerTool(
    "twitter_follow_user",
    {
      description: "Follow a user on Twitter/X",
      inputSchema: {
        targetUserId: z.string().regex(/^\d+$/).describe("The user ID of the account to follow"),
      },
    },
    async ({ targetUserId }) => {
      try {
        const client = await getTwitterClient();
        const userId = await getAuthenticatedUserId(client);
        const result = await client.v2.follow(userId, targetUserId);
        return jsonResponse({ success: true, following: result.data.following, pendingFollow: result.data.pending_follow, targetUserId });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to follow user"));
      }
    },
  );

  // --- Unfollow user ---
  server.registerTool(
    "twitter_unfollow_user",
    {
      description: "Unfollow a user on Twitter/X",
      inputSchema: {
        targetUserId: z.string().regex(/^\d+$/).describe("The user ID of the account to unfollow"),
      },
    },
    async ({ targetUserId }) => {
      try {
        const client = await getTwitterClient();
        const userId = await getAuthenticatedUserId(client);
        const result = await client.v2.unfollow(userId, targetUserId);
        return jsonResponse({ success: true, following: result.data.following, targetUserId });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to unfollow user"));
      }
    },
  );
}

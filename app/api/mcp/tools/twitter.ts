// @ts-nocheck — MCP tool types cause exponential type inference
/**
 * Twitter/X MCP Tools - Tweets, Users, Engagement
 * Uses per-organization OAuth 1.0a tokens via oauthService + twitter-api-v2.
 *
 * Requires platform env vars TWITTER_API_KEY + TWITTER_API_SECRET_KEY
 * and per-org secrets TWITTER_ACCESS_TOKEN + TWITTER_ACCESS_TOKEN_SECRET.
 */

import type { McpServer } from "mcp-handler";
import { TwitterApi } from "twitter-api-v2";
import { z } from "zod3";
import { oauthService } from "@/lib/services/oauth";
import { logger } from "@/lib/utils/logger";
import { getAuthContext } from "../lib/context";
import { errorResponse, jsonResponse } from "../lib/responses";

const TWITTER_API_KEY = process.env.TWITTER_API_KEY || "";
const TWITTER_API_SECRET_KEY = process.env.TWITTER_API_SECRET_KEY || "";

const USER_ID_CACHE_TTL_MS = 5 * 60 * 1000;
const USER_ID_CACHE_MAX_SIZE = 100;

async function getTwitterClient(): Promise<TwitterApi> {
  if (!TWITTER_API_KEY || !TWITTER_API_SECRET_KEY) {
    throw new Error(
      "Twitter API credentials not configured at platform level. Set TWITTER_API_KEY and TWITTER_API_SECRET_KEY.",
    );
  }

  const { user } = getAuthContext();
  let result;

  try {
    result = await oauthService.getValidTokenByPlatform({
      organizationId: user.organization_id,
      platform: "twitter",
    });
  } catch (error) {
    logger.warn("[TwitterMCP] Failed to get token", {
      organizationId: user.organization_id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error("Twitter account not connected. Connect in Settings > Connections.");
  }

  if (!result.accessTokenSecret) {
    logger.warn("[TwitterMCP] Access token secret missing", {
      organizationId: user.organization_id,
    });
    throw new Error(
      "Twitter access token secret is missing. Reconnect Twitter in Settings > Connections.",
    );
  }

  return new TwitterApi({
    appKey: TWITTER_API_KEY,
    appSecret: TWITTER_API_SECRET_KEY,
    accessToken: result.accessToken,
    accessSecret: result.accessTokenSecret,
  });
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
  const err = error as Error & {
    code?: number;
    data?: { detail?: string; title?: string; status?: number };
    rateLimit?: { remaining?: number; reset?: number };
  };
  const parts: string[] = [err.message];
  if (err.data?.detail) parts.push(err.data.detail);
  if (err.code) parts.push(`code: ${err.code}`);
  if (err.rateLimit?.remaining === 0 && err.rateLimit?.reset) {
    const resetAt = new Date(err.rateLimit.reset * 1000).toISOString();
    logger.warn("[TwitterMCP] Rate limit hit", { code: err.code, resetAt });
    parts.push(`rate limit resets at ${resetAt}`);
  }
  return parts.join(" — ");
}

async function resolveUserIdFromUsername(client: TwitterApi, username: string): Promise<string> {
  const cleaned = username.replace(/^@/, "");
  const user = await client.v2.userByUsername(cleaned);
  if (!user.data) throw new Error(`User @${cleaned} not found`);
  return user.data.id;
}

async function resolveTargetUserId(
  client: TwitterApi,
  targetUserId?: string,
  username?: string,
): Promise<string> {
  if (targetUserId) {
    return targetUserId;
  }

  if (!username) {
    throw new Error("Provide either targetUserId or username");
  }

  return await resolveUserIdFromUsername(client, username);
}

function extractTweetIdFromUrl(url: string): string | null {
  const match = url.match(/(?:(?:mobile\.)?twitter\.com|x\.com)\/\w+\/status\/(\d+)/);
  return match ? match[1] : null;
}

// ── Shared field selections ──────────────────────────────────────────────────
const TIMELINE_TWEET_FIELDS = ["created_at", "public_metrics", "entities", "referenced_tweets"];
const SEARCH_TWEET_FIELDS = ["created_at", "public_metrics", "author_id", "entities"];
const MENTION_TWEET_FIELDS = [...SEARCH_TWEET_FIELDS, "referenced_tweets"];
const DETAIL_TWEET_FIELDS = [
  "created_at",
  "public_metrics",
  "author_id",
  "conversation_id",
  "in_reply_to_user_id",
  "referenced_tweets",
  "entities",
];
const USER_PROFILE_FIELDS = [
  "description",
  "public_metrics",
  "profile_image_url",
  "created_at",
  "location",
  "url",
  "verified",
];
const USER_SUMMARY_FIELDS = ["description", "public_metrics", "profile_image_url", "verified"];

// ── Shared mappers ───────────────────────────────────────────────────────────
type TweetSummaryRecord = {
  id: string;
  text: string;
  created_at?: string;
  public_metrics?: unknown;
  author_id?: string;
  referenced_tweets?: unknown;
};

type UserProfileRecord = {
  id: string;
  username: string;
  name: string;
  description?: string | null;
  profile_image_url?: string | null;
  public_metrics?: unknown;
  created_at?: string;
  location?: string | null;
  url?: string | null;
  verified?: boolean;
};

type UserSummaryRecord = {
  id: string;
  username: string;
  name: string;
  description?: string | null;
  public_metrics?: unknown;
  verified?: boolean;
};

function mapTweetSummary(t: TweetSummaryRecord): Record<string, unknown> {
  const mapped: Record<string, unknown> = {
    id: t.id,
    text: t.text,
    createdAt: t.created_at,
    publicMetrics: t.public_metrics,
  };
  if (t.author_id) mapped.authorId = t.author_id;
  if (t.referenced_tweets) mapped.referencedTweets = t.referenced_tweets;
  return mapped;
}

function mapUserProfile(data: UserProfileRecord): Record<string, unknown> {
  return {
    id: data.id,
    username: data.username,
    name: data.name,
    description: data.description,
    profileImageUrl: data.profile_image_url,
    publicMetrics: data.public_metrics,
    createdAt: data.created_at,
    location: data.location,
    url: data.url,
    verified: data.verified,
  };
}

function mapUserSummary(u: UserSummaryRecord): Record<string, unknown> {
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    description: u.description,
    publicMetrics: u.public_metrics,
    verified: u.verified,
  };
}

function paginatedTweetResponse(
  tweets: Record<string, unknown>[],
  meta: Record<string, unknown> | undefined,
  extra: Record<string, unknown> = {},
) {
  return {
    resultCount: tweets.length,
    newestTweetDate: tweets[0]?.created_at ?? null,
    oldestTweetDate: tweets[tweets.length - 1]?.created_at ?? null,
    nextToken: meta?.next_token ?? null,
    tweets: tweets.map(mapTweetSummary),
    ...extra,
  };
}

// ── Shared fetchers ──────────────────────────────────────────────────────────
async function fetchUserTimeline(
  client: TwitterApi,
  userId: string,
  {
    maxResults = 10,
    startTime,
    endTime,
    exclude,
    paginationToken,
  }: {
    maxResults?: number;
    startTime?: string;
    endTime?: string;
    exclude?: string[];
    paginationToken?: string;
  },
) {
  const opts: Record<string, unknown> = {
    max_results: maxResults,
    "tweet.fields": TIMELINE_TWEET_FIELDS,
  };
  if (startTime) opts.start_time = startTime;
  if (endTime) opts.end_time = endTime;
  if (exclude?.length) opts.exclude = exclude;
  if (paginationToken) opts.pagination_token = paginationToken;

  const timeline = await client.v2.userTimeline(userId, opts);
  return paginatedTweetResponse(timeline.data?.data || [], timeline.data?.meta, { userId });
}

async function fetchTweetDetails(client: TwitterApi, tweetId: string) {
  const tweet = await client.v2.singleTweet(tweetId, {
    "tweet.fields": DETAIL_TWEET_FIELDS,
    expansions: ["author_id"],
    "user.fields": ["username", "name", "profile_image_url"],
  });
  return {
    id: tweet.data.id,
    text: tweet.data.text,
    authorId: tweet.data.author_id,
    createdAt: tweet.data.created_at,
    publicMetrics: tweet.data.public_metrics,
    conversationId: tweet.data.conversation_id,
    referencedTweets: tweet.data.referenced_tweets,
    entities: tweet.data.entities,
    includes: tweet.includes,
  };
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
        const me = await client.v2.me({ "user.fields": USER_PROFILE_FIELDS });
        return jsonResponse(mapUserProfile(me.data));
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
          "user.fields": USER_PROFILE_FIELDS,
        });
        if (!user.data) return errorResponse(`User @${username} not found`);
        return jsonResponse(mapUserProfile(user.data));
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
        logger.warn("[TwitterMCP] Tweet deleted", { tweetId });
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
        return jsonResponse(await fetchTweetDetails(client, tweetId));
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to get tweet"));
      }
    },
  );

  // --- Search recent tweets ---
  server.registerTool(
    "twitter_search_tweets",
    {
      description:
        "Search for recent tweets matching a query (last 7 days only). Supports date filtering within that window, sorting, and pagination. Use Twitter search operators like from:username, #hashtag, has:media. For older tweets from a specific user, use twitter_get_user_tweets or twitter_get_my_tweets with date filters instead.",
      inputSchema: {
        query: z
          .string()
          .describe(
            "Search query (supports Twitter operators: from:user, to:user, #hashtag, has:media, has:links, is:reply, is:retweet, lang:en, etc.)",
          ),
        maxResults: z
          .number()
          .min(10)
          .max(100)
          .optional()
          .describe("Number of results per page (10-100, default 10)"),
        startTime: z
          .string()
          .optional()
          .describe("Only tweets after this date (ISO 8601, must be within last 7 days)"),
        endTime: z.string().optional().describe("Only tweets before this date (ISO 8601)"),
        sortOrder: z
          .enum(["recency", "relevancy"])
          .optional()
          .describe("Sort by recency (newest first) or relevancy"),
        paginationToken: z
          .string()
          .optional()
          .describe("Token from a previous response's nextToken to fetch the next page"),
      },
    },
    async ({ query, maxResults = 10, startTime, endTime, sortOrder, paginationToken }) => {
      try {
        const client = await getTwitterClient();
        const opts: Record<string, unknown> = {
          max_results: maxResults,
          "tweet.fields": SEARCH_TWEET_FIELDS,
          expansions: ["author_id"],
          "user.fields": ["username", "name"],
        };
        if (startTime) opts.start_time = startTime;
        if (endTime) opts.end_time = endTime;
        if (sortOrder) opts.sort_order = sortOrder;
        if (paginationToken) opts.next_token = paginationToken;

        const results = await client.v2.search(query, opts);
        return jsonResponse(
          paginatedTweetResponse(results.data?.data || [], results.data?.meta, {
            query,
            includes: results.data?.includes,
          }),
        );
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to search tweets"));
      }
    },
  );

  // --- Get user's tweets (timeline) ---
  server.registerTool(
    "twitter_get_user_tweets",
    {
      description:
        "Get tweets posted by a specific user. Supports date filtering, pagination, and excluding retweets/replies. For the authenticated user's own tweets, prefer twitter_get_my_tweets.",
      inputSchema: {
        userId: z.string().regex(/^\d+$/).describe("The Twitter user ID (numeric)"),
        maxResults: z
          .number()
          .min(5)
          .max(100)
          .optional()
          .describe("Number of tweets per page (5-100, default 10)"),
        startTime: z
          .string()
          .optional()
          .describe("Only tweets after this date (ISO 8601, e.g. 2026-02-01T00:00:00Z)"),
        endTime: z
          .string()
          .optional()
          .describe("Only tweets before this date (ISO 8601, e.g. 2026-02-28T23:59:59Z)"),
        exclude: z
          .array(z.enum(["retweets", "replies"]))
          .optional()
          .describe("Exclude retweets and/or replies from results"),
        paginationToken: z
          .string()
          .optional()
          .describe("Token from a previous response's nextToken to fetch the next page"),
      },
    },
    async ({ userId, maxResults, startTime, endTime, exclude, paginationToken }) => {
      try {
        const client = await getTwitterClient();
        return jsonResponse(
          await fetchUserTimeline(client, userId, {
            maxResults,
            startTime,
            endTime,
            exclude,
            paginationToken,
          }),
        );
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to get user tweets"));
      }
    },
  );

  // --- Get authenticated user's own tweets ---
  server.registerTool(
    "twitter_get_my_tweets",
    {
      description:
        "Get the authenticated user's own tweets. No user ID needed. Supports date range filtering via ISO 8601 timestamps (convert natural language like 'last week' or 'January' to ISO dates), excluding retweets/replies, and pagination for fetching all results.",
      inputSchema: {
        maxResults: z
          .number()
          .min(5)
          .max(100)
          .optional()
          .describe("Number of tweets per page (5-100, default 10)"),
        startTime: z
          .string()
          .optional()
          .describe("Only tweets after this date (ISO 8601, e.g. 2026-02-01T00:00:00Z)"),
        endTime: z
          .string()
          .optional()
          .describe("Only tweets before this date (ISO 8601, e.g. 2026-02-28T23:59:59Z)"),
        exclude: z
          .array(z.enum(["retweets", "replies"]))
          .optional()
          .describe("Exclude retweets and/or replies from results"),
        paginationToken: z
          .string()
          .optional()
          .describe("Token from a previous response's nextToken to fetch the next page"),
      },
    },
    async ({ maxResults, startTime, endTime, exclude, paginationToken }) => {
      try {
        const client = await getTwitterClient();
        const userId = await getAuthenticatedUserId(client);
        return jsonResponse(
          await fetchUserTimeline(client, userId, {
            maxResults,
            startTime,
            endTime,
            exclude,
            paginationToken,
          }),
        );
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to get your tweets"));
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
        logger.info("[TwitterMCP] Tweet liked", { tweetId });
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
        logger.info("[TwitterMCP] Tweet unliked", { tweetId });
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
        logger.info("[TwitterMCP] Retweeted", { tweetId });
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
        logger.info("[TwitterMCP] Unretweeted", { tweetId });
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
      description:
        "Get a list of users who follow the specified user. Supports pagination to fetch all followers.",
      inputSchema: {
        userId: z.string().regex(/^\d+$/).describe("The Twitter user ID to get followers for"),
        maxResults: z
          .number()
          .min(1)
          .max(100)
          .optional()
          .describe("Number of followers per page (1-100, default 20)"),
        paginationToken: z
          .string()
          .optional()
          .describe("Token from a previous response's nextToken to fetch the next page"),
      },
    },
    async ({ userId, maxResults = 20, paginationToken }) => {
      try {
        const client = await getTwitterClient();
        const opts: Record<string, unknown> = {
          max_results: maxResults,
          "user.fields": USER_SUMMARY_FIELDS,
        };
        if (paginationToken) opts.pagination_token = paginationToken;

        const followers = await client.v2.followers(userId, opts);
        const users = followers.data?.data || [];
        return jsonResponse({
          userId,
          resultCount: users.length,
          nextToken: followers.data?.meta?.next_token ?? null,
          followers: users.map(mapUserSummary),
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
      description:
        "Get a list of users that the specified user is following. Supports pagination to fetch all.",
      inputSchema: {
        userId: z.string().regex(/^\d+$/).describe("The Twitter user ID to get following list for"),
        maxResults: z
          .number()
          .min(1)
          .max(100)
          .optional()
          .describe("Number of users per page (1-100, default 20)"),
        paginationToken: z
          .string()
          .optional()
          .describe("Token from a previous response's nextToken to fetch the next page"),
      },
    },
    async ({ userId, maxResults = 20, paginationToken }) => {
      try {
        const client = await getTwitterClient();
        const opts: Record<string, unknown> = {
          max_results: maxResults,
          "user.fields": USER_SUMMARY_FIELDS,
        };
        if (paginationToken) opts.pagination_token = paginationToken;

        const following = await client.v2.following(userId, opts);
        const users = following.data?.data || [];
        return jsonResponse({
          userId,
          resultCount: users.length,
          nextToken: following.data?.meta?.next_token ?? null,
          following: users.map(mapUserSummary),
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
      description:
        "Follow a user on Twitter/X. Accepts either a username (handle) or a numeric user ID.",
      inputSchema: {
        targetUserId: z
          .string()
          .regex(/^\d+$/)
          .optional()
          .describe("The numeric user ID of the account to follow"),
        username: z
          .string()
          .optional()
          .describe(
            "The Twitter username/handle to follow (without @). Provide this or targetUserId.",
          ),
      },
    },
    async ({ targetUserId, username }) => {
      try {
        if (!targetUserId && !username) {
          return errorResponse("Provide either targetUserId or username");
        }
        const client = await getTwitterClient();
        const [resolvedId, userId] = await Promise.all([
          resolveTargetUserId(client, targetUserId, username),
          getAuthenticatedUserId(client),
        ]);
        const result = await client.v2.follow(userId, resolvedId);
        logger.warn("[TwitterMCP] Followed user", { targetUserId: resolvedId });
        return jsonResponse({
          success: true,
          following: result.data.following,
          pendingFollow: result.data.pending_follow,
          targetUserId: resolvedId,
        });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to follow user"));
      }
    },
  );

  // --- Unfollow user ---
  server.registerTool(
    "twitter_unfollow_user",
    {
      description:
        "Unfollow a user on Twitter/X. Accepts either a username (handle) or a numeric user ID.",
      inputSchema: {
        targetUserId: z
          .string()
          .regex(/^\d+$/)
          .optional()
          .describe("The numeric user ID of the account to unfollow"),
        username: z
          .string()
          .optional()
          .describe(
            "The Twitter username/handle to unfollow (without @). Provide this or targetUserId.",
          ),
      },
    },
    async ({ targetUserId, username }) => {
      try {
        if (!targetUserId && !username) {
          return errorResponse("Provide either targetUserId or username");
        }
        const client = await getTwitterClient();
        const [resolvedId, userId] = await Promise.all([
          resolveTargetUserId(client, targetUserId, username),
          getAuthenticatedUserId(client),
        ]);
        const result = await client.v2.unfollow(userId, resolvedId);
        logger.warn("[TwitterMCP] Unfollowed user", { targetUserId: resolvedId });
        return jsonResponse({
          success: true,
          following: result.data.following,
          targetUserId: resolvedId,
        });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to unfollow user"));
      }
    },
  );

  // --- Get mentions ---
  server.registerTool(
    "twitter_get_mentions",
    {
      description:
        "Get tweets that mention the authenticated user. Use when user asks 'who mentioned me', 'show my mentions', or 'who tagged me'. Supports date filtering and pagination.",
      inputSchema: {
        maxResults: z
          .number()
          .min(5)
          .max(100)
          .optional()
          .describe("Number of mentions per page (5-100, default 10)"),
        startTime: z.string().optional().describe("Only mentions after this date (ISO 8601)"),
        endTime: z.string().optional().describe("Only mentions before this date (ISO 8601)"),
        paginationToken: z
          .string()
          .optional()
          .describe("Token from a previous response's nextToken to fetch the next page"),
      },
    },
    async ({ maxResults = 10, startTime, endTime, paginationToken }) => {
      try {
        const client = await getTwitterClient();
        const userId = await getAuthenticatedUserId(client);

        const opts: Record<string, unknown> = {
          max_results: maxResults,
          "tweet.fields": MENTION_TWEET_FIELDS,
          expansions: ["author_id"],
          "user.fields": ["username", "name", "profile_image_url"],
        };
        if (startTime) opts.start_time = startTime;
        if (endTime) opts.end_time = endTime;
        if (paginationToken) opts.pagination_token = paginationToken;

        const mentions = await client.v2.userMentionTimeline(userId, opts);
        return jsonResponse(
          paginatedTweetResponse(mentions.data?.data || [], mentions.data?.meta, {
            userId,
            includes: mentions.data?.includes,
          }),
        );
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to get mentions"));
      }
    },
  );

  // --- Get liked tweets ---
  server.registerTool(
    "twitter_get_liked_tweets",
    {
      description:
        "Get tweets that the authenticated user has liked. Use when user asks 'show my likes' or 'tweets I liked'. Supports pagination.",
      inputSchema: {
        maxResults: z
          .number()
          .min(10)
          .max(100)
          .optional()
          .describe("Number of liked tweets per page (10-100, default 10)"),
        paginationToken: z
          .string()
          .optional()
          .describe("Token from a previous response's nextToken to fetch the next page"),
      },
    },
    async ({ maxResults = 10, paginationToken }) => {
      try {
        const client = await getTwitterClient();
        const userId = await getAuthenticatedUserId(client);

        const opts: Record<string, unknown> = {
          max_results: maxResults,
          "tweet.fields": SEARCH_TWEET_FIELDS,
          expansions: ["author_id"],
          "user.fields": ["username", "name"],
        };
        if (paginationToken) opts.pagination_token = paginationToken;

        const liked = await client.v2.userLikedTweets(userId, opts);
        return jsonResponse(
          paginatedTweetResponse(liked.data?.data || [], liked.data?.meta, {
            includes: liked.data?.includes,
          }),
        );
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to get liked tweets"));
      }
    },
  );

  // --- Get bookmarks ---
  server.registerTool(
    "twitter_get_bookmarks",
    {
      description:
        "Get the authenticated user's bookmarked tweets. Supports pagination. Note: may require OAuth 2.0 scope depending on connection type.",
      inputSchema: {
        maxResults: z
          .number()
          .min(1)
          .max(100)
          .optional()
          .describe("Number of bookmarks per page (1-100, default 10)"),
        paginationToken: z
          .string()
          .optional()
          .describe("Token from a previous response's nextToken to fetch the next page"),
      },
    },
    async ({ maxResults = 10, paginationToken }) => {
      try {
        const client = await getTwitterClient();

        const opts: Record<string, unknown> = {
          max_results: maxResults,
          "tweet.fields": SEARCH_TWEET_FIELDS,
          expansions: ["author_id"],
          "user.fields": ["username", "name"],
        };
        if (paginationToken) opts.pagination_token = paginationToken;

        const bookmarks = await client.v2.bookmarks(opts);
        return jsonResponse(
          paginatedTweetResponse(bookmarks.data?.data || [], bookmarks.data?.meta, {
            includes: bookmarks.data?.includes,
          }),
        );
      } catch (error) {
        return errorResponse(
          errMsg(error, "Failed to get bookmarks — requires OAuth 2.0 user context"),
        );
      }
    },
  );

  // --- Create tweet thread ---
  server.registerTool(
    "twitter_create_thread",
    {
      description:
        "Post a tweet thread (multiple tweets chained as replies). Provide an array of tweet texts in order. The first tweet starts the thread and each subsequent tweet is a reply to the previous one.",
      inputSchema: {
        tweets: z
          .array(z.string().min(1).max(280))
          .min(2)
          .max(25)
          .describe("Array of tweet texts in thread order (2-25 tweets, each max 280 chars)"),
      },
    },
    async ({ tweets }) => {
      try {
        const client = await getTwitterClient();
        const posted: { id: string; text: string }[] = [];
        let lastTweetId: string | undefined;

        for (let i = 0; i < tweets.length; i++) {
          try {
            if (i > 0) await new Promise((r) => setTimeout(r, 500));
            const params: Record<string, unknown> = {};
            if (lastTweetId) {
              params.reply = { in_reply_to_tweet_id: lastTweetId };
            }
            const tweet = await client.v2.tweet(tweets[i], params);
            posted.push({ id: tweet.data.id, text: tweet.data.text });
            lastTweetId = tweet.data.id;
          } catch (error) {
            const threadUrl = posted[0] ? `https://x.com/i/status/${posted[0].id}` : null;
            logger.error("[TwitterMCP] Thread partially failed", {
              posted: posted.length,
              total: tweets.length,
            });
            return errorResponse(
              errMsg(error, `Thread failed at tweet ${posted.length + 1} of ${tweets.length}`),
              {
                partialThread: posted,
                threadUrl,
                completedCount: posted.length,
                totalCount: tweets.length,
              },
            );
          }
        }

        logger.info("[TwitterMCP] Thread created", {
          tweetCount: posted.length,
          firstTweetId: posted[0].id,
        });

        return jsonResponse({
          success: true,
          threadLength: posted.length,
          tweets: posted,
          threadUrl: `https://x.com/i/status/${posted[0].id}`,
        });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to create thread"));
      }
    },
  );

  // --- Resolve tweet from URL ---
  server.registerTool(
    "twitter_resolve_tweet_url",
    {
      description:
        "Get full tweet details from a Twitter/X URL (e.g. https://x.com/user/status/123). Use when user pastes a tweet link and wants to interact with it.",
      inputSchema: {
        url: z.string().min(1).describe("The tweet URL from twitter.com or x.com"),
      },
    },
    async ({ url }) => {
      try {
        const tweetId = extractTweetIdFromUrl(url);
        if (!tweetId) {
          const hint = /t\.co\//i.test(url)
            ? "Shortened t.co links are not supported — paste the full x.com or twitter.com URL."
            : "Expected format: https://x.com/user/status/123456";
          return errorResponse(`Could not extract tweet ID from URL. ${hint}`);
        }

        const client = await getTwitterClient();
        const details = await fetchTweetDetails(client, tweetId);
        return jsonResponse({ ...details, sourceUrl: url });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to resolve tweet from URL"));
      }
    },
  );

  // --- Check follow relationship ---
  server.registerTool(
    "twitter_check_relationship",
    {
      description:
        "Check the follow relationship between two Twitter users. Use when user asks 'does X follow me', 'do I follow X', or 'are we mutuals'. Provide usernames (handles).",
      inputSchema: {
        sourceUsername: z.string().describe("First username/handle (without @)"),
        targetUsername: z.string().describe("Second username/handle (without @)"),
      },
    },
    async ({ sourceUsername, targetUsername }) => {
      try {
        const client = await getTwitterClient();
        const cleanSource = sourceUsername.replace(/^@/, "");
        const cleanTarget = targetUsername.replace(/^@/, "");

        // v1.1 friendships/show — no single-call v2 equivalent exists.
        // If Twitter kills this endpoint, replace with two v2.followers() lookups.
        const relationship = await client.v1.friendship({
          source_screen_name: cleanSource,
          target_screen_name: cleanTarget,
        });

        return jsonResponse({
          sourceUsername: cleanSource,
          targetUsername: cleanTarget,
          sourceFollowsTarget: relationship.source.following,
          targetFollowsSource: relationship.source.followed_by,
          mutualFollow: relationship.source.following && relationship.source.followed_by,
        });
      } catch (error) {
        return errorResponse(errMsg(error, "Failed to check relationship"));
      }
    },
  );
}

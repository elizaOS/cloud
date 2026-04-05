/**
 * Twitter MCP Tools Tests
 *
 * Mocks: twitter-api-v2 (external API) and OAuth service.
 * Real: all handler logic, helpers, mappers, error formatting.
 */

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { authContextStorage } from "@/app/api/mcp/lib/context";
import type { OAuthConnection } from "@/lib/services/oauth/types";

afterAll(() => {
  mock.restore();
});

function twitterOAuthFixture(
  o: Partial<OAuthConnection> & Pick<OAuthConnection, "id" | "status">,
): OAuthConnection {
  const { id, status, ...rest } = o;
  return {
    platform: "twitter",
    platformUserId: rest.platformUserId ?? `pu-${id}`,
    scopes: rest.scopes ?? [],
    linkedAt: rest.linkedAt ?? new Date("2026-01-01T00:00:00Z"),
    tokenExpired: rest.tokenExpired ?? false,
    source: rest.source ?? "platform_credentials",
    id,
    status,
    ...rest,
  };
}

process.env.TWITTER_API_KEY = "test-api-key";
process.env.TWITTER_API_SECRET_KEY = "test-api-secret";

// ── Mock Twitter API v2 ──────────────────────────────────────────────────────

let mockV2: Record<string, ReturnType<typeof mock>>;
let mockV1: Record<string, ReturnType<typeof mock>>;

function resetTwitterMocks() {
  mockV2 = {
    me: mock(async () => ({
      data: {
        id: "111",
        username: "testuser",
        name: "Test User",
        description: "builder",
        profile_image_url: "https://img.co/1",
        public_metrics: { followers_count: 100, following_count: 50, tweet_count: 200 },
        created_at: "2020-01-01T00:00:00Z",
        location: "SF",
        url: "https://test.dev",
        verified: false,
      },
    })),
    userByUsername: mock(async (username: string) => ({
      data: {
        id: "222",
        username,
        name: "Other User",
        description: "dev",
        profile_image_url: "https://img.co/2",
        public_metrics: { followers_count: 50 },
        created_at: "2021-06-15T00:00:00Z",
        location: null,
        url: null,
        verified: false,
      },
    })),
    singleTweet: mock(async () => ({
      data: {
        id: "tweet-1",
        text: "hello world",
        author_id: "111",
        created_at: "2026-02-20T10:00:00Z",
        public_metrics: { like_count: 5, retweet_count: 1 },
        conversation_id: "conv-1",
        referenced_tweets: null,
        entities: null,
      },
      includes: { users: [{ id: "111", username: "testuser", name: "Test User" }] },
    })),
    search: mock(async () => ({
      data: {
        data: [
          {
            id: "s1",
            text: "search hit",
            author_id: "222",
            created_at: "2026-02-20T12:00:00Z",
            public_metrics: { like_count: 3 },
          },
        ],
        meta: { next_token: "search-page2", result_count: 1 },
        includes: { users: [{ id: "222", username: "other", name: "Other" }] },
      },
    })),
    userTimeline: mock(async () => ({
      data: {
        data: [
          {
            id: "t1",
            text: "newest tweet",
            created_at: "2026-02-20T10:00:00Z",
            public_metrics: { like_count: 10 },
            referenced_tweets: null,
          },
          {
            id: "t2",
            text: "older tweet",
            created_at: "2026-02-15T10:00:00Z",
            public_metrics: { like_count: 2 },
            referenced_tweets: [{ type: "retweeted", id: "orig-1" }],
          },
        ],
        meta: { next_token: "timeline-page2", result_count: 2 },
      },
    })),
    userMentionTimeline: mock(async () => ({
      data: {
        data: [
          {
            id: "m1",
            text: "@testuser nice!",
            author_id: "333",
            created_at: "2026-02-19T08:00:00Z",
            public_metrics: { like_count: 1 },
            referenced_tweets: null,
          },
        ],
        meta: { result_count: 1 },
        includes: { users: [{ id: "333", username: "mentioner" }] },
      },
    })),
    userLikedTweets: mock(async () => ({
      data: {
        data: [
          {
            id: "l1",
            text: "liked this",
            author_id: "444",
            created_at: "2026-02-18T00:00:00Z",
            public_metrics: { like_count: 99 },
          },
        ],
        meta: { next_token: "likes-page2", result_count: 1 },
        includes: { users: [{ id: "444", username: "popular" }] },
      },
    })),
    bookmarks: mock(async () => ({
      data: { data: [], meta: { result_count: 0 } },
    })),
    tweet: mock(async (text: string) => ({
      data: { id: `new-${Math.random().toString(36).slice(2, 8)}`, text },
    })),
    deleteTweet: mock(async () => ({ data: { deleted: true } })),
    like: mock(async () => ({ data: { liked: true } })),
    unlike: mock(async () => ({ data: { liked: false } })),
    retweet: mock(async () => ({ data: { retweeted: true } })),
    unretweet: mock(async () => ({ data: { retweeted: false } })),
    followers: mock(async () => ({
      data: {
        data: [
          {
            id: "f1",
            username: "follower1",
            name: "Follower",
            description: "hi",
            public_metrics: { followers_count: 10 },
            verified: false,
          },
        ],
        meta: { next_token: "followers-page2", result_count: 1 },
      },
    })),
    following: mock(async () => ({
      data: {
        data: [
          {
            id: "fw1",
            username: "following1",
            name: "Following",
            description: "",
            public_metrics: {},
            verified: true,
          },
        ],
        meta: { result_count: 1 },
      },
    })),
    follow: mock(async () => ({ data: { following: true, pending_follow: false } })),
    unfollow: mock(async () => ({ data: { following: false } })),
  };

  mockV1 = {
    friendship: mock(async () => ({
      source: { following: true, followed_by: true },
    })),
  };
}

mock.module("twitter-api-v2", () => ({
  TwitterApi: class {
    v2 = new Proxy({} as Record<string, unknown>, { get: (_, p) => mockV2[p as string] });
    v1 = new Proxy({} as Record<string, unknown>, { get: (_, p) => mockV1[p as string] });
  },
}));

// ── Mock OAuth ───────────────────────────────────────────────────────────────

const mockOAuth = {
  getValidTokenByPlatform: mock(async () => ({
    accessToken: "tok",
    accessTokenSecret: "sec",
  })),
  listConnections: mock(async () => [
    twitterOAuthFixture({
      id: "c1",
      status: "active",
      displayName: "testuser",
      scopes: ["read", "write"],
    }),
  ]),
};

mock.module("@/lib/services/oauth", () => ({ oauthService: mockOAuth }));

// ── Test helpers ─────────────────────────────────────────────────────────────

type AnyFn = (...args: unknown[]) => unknown;

function auth(orgId = "org-1") {
  return {
    user: {
      id: `u-${orgId}`,
      organization_id: orgId,
      organization: { id: orgId, name: "Org", credit_balance: 100 },
    },
  } as any;
}

type TwitterToolHandlerResult = {
  content: Array<{ text: string }>;
  isError?: boolean;
};

async function callTool(
  name: string,
  args: Record<string, unknown> = {},
  orgId = "org-1",
): Promise<TwitterToolHandlerResult> {
  const { registerTwitterTools } = await import("@/app/api/mcp/tools/twitter");
  let handler: AnyFn | undefined;
  const mockServer = {
    registerTool: (n: string, _s: unknown, h: AnyFn) => {
      if (n === name) handler = h;
    },
  } as any;
  registerTwitterTools(mockServer);
  if (!handler) throw new Error(`Tool "${name}" not found`);
  const h = handler;
  return authContextStorage.run(auth(orgId), () => h(args)) as Promise<TwitterToolHandlerResult>;
}

function parse(result: TwitterToolHandlerResult) {
  return JSON.parse(result.content[0].text);
}

// ══════════════════════════════════════════════════════════════════════════════

describe("Twitter MCP Tools", () => {
  beforeEach(() => {
    resetTwitterMocks();
    mockOAuth.getValidTokenByPlatform.mockReset();
    mockOAuth.getValidTokenByPlatform.mockImplementation(async () => ({
      accessToken: "tok",
      accessTokenSecret: "sec",
    }));
    mockOAuth.listConnections.mockReset();
    mockOAuth.listConnections.mockImplementation(async () => [
      twitterOAuthFixture({
        id: "c1",
        status: "active",
        displayName: "testuser",
        scopes: ["read", "write"],
      }),
    ]);
  });

  // ── Registration ──────────────────────────────────────────────────────────

  describe("Registration", () => {
    test("exports registerTwitterTools", async () => {
      const mod = await import("@/app/api/mcp/tools/twitter");
      expect(typeof mod.registerTwitterTools).toBe("function");
    });

    test("registers all expected tools", async () => {
      const { registerTwitterTools } = await import("@/app/api/mcp/tools/twitter");
      const names: string[] = [];
      registerTwitterTools({
        registerTool: (n: string) => {
          names.push(n);
        },
      } as any);

      const expectedTools = [
        "twitter_status",
        "twitter_get_me",
        "twitter_get_user",
        "twitter_create_tweet",
        "twitter_delete_tweet",
        "twitter_get_tweet",
        "twitter_search_tweets",
        "twitter_get_user_tweets",
        "twitter_get_my_tweets",
        "twitter_like_tweet",
        "twitter_unlike_tweet",
        "twitter_retweet",
        "twitter_unretweet",
        "twitter_get_followers",
        "twitter_get_following",
        "twitter_follow_user",
        "twitter_unfollow_user",
        "twitter_get_mentions",
        "twitter_get_liked_tweets",
        "twitter_get_bookmarks",
        "twitter_create_thread",
        "twitter_resolve_tweet_url",
        "twitter_check_relationship",
      ];
      expect(names.length).toBe(expectedTools.length);
      for (const t of expectedTools) {
        expect(names).toContain(t);
      }
    });
  });

  // ── twitter_status ────────────────────────────────────────────────────────

  describe("twitter_status", () => {
    test("returns connected with username when active", async () => {
      const p = parse(await callTool("twitter_status"));
      expect(p.connected).toBe(true);
      expect(p.username).toBe("testuser");
      expect(p.scopes).toContain("read");
    });

    test("returns connected=false when no active connection", async () => {
      mockOAuth.listConnections.mockImplementation(async () => []);
      const p = parse(await callTool("twitter_status"));
      expect(p.connected).toBe(false);
      expect(p.message).toContain("not connected");
    });

    test("filters out revoked/expired connections", async () => {
      mockOAuth.listConnections.mockImplementation(async () => [
        twitterOAuthFixture({ id: "c1", status: "revoked", displayName: "old" }),
        twitterOAuthFixture({ id: "c2", status: "expired", displayName: "expired" }),
      ]);
      const p = parse(await callTool("twitter_status"));
      expect(p.connected).toBe(false);
    });

    test("returns error on service failure", async () => {
      mockOAuth.listConnections.mockImplementation(async () => {
        throw new Error("DB down");
      });
      const r = await callTool("twitter_status");
      expect(r.isError).toBe(true);
      expect(parse(r).error).toContain("DB down");
    });
  });

  // ── twitter_get_me ────────────────────────────────────────────────────────

  describe("twitter_get_me", () => {
    test("returns mapped profile fields", async () => {
      const p = parse(await callTool("twitter_get_me"));
      expect(p.id).toBe("111");
      expect(p.username).toBe("testuser");
      expect(p.name).toBe("Test User");
      expect(p.description).toBe("builder");
      expect(p.profileImageUrl).toBe("https://img.co/1");
      expect(p.publicMetrics.followers_count).toBe(100);
      expect(p.location).toBe("SF");
    });

    test("returns error when not connected", async () => {
      mockOAuth.getValidTokenByPlatform.mockImplementation(async () => {
        throw new Error("Not connected");
      });
      const r = await callTool("twitter_get_me");
      expect(r.isError).toBe(true);
    });
  });

  // ── twitter_get_my_tweets (the most critical tool) ────────────────────────

  describe("twitter_get_my_tweets", () => {
    test("returns tweets with enriched metadata", async () => {
      const p = parse(await callTool("twitter_get_my_tweets"));
      expect(p.resultCount).toBe(2);
      expect(p.newestTweetDate).toBe("2026-02-20T10:00:00Z");
      expect(p.oldestTweetDate).toBe("2026-02-15T10:00:00Z");
      expect(p.nextToken).toBe("timeline-page2");
      expect(p.tweets[0].id).toBe("t1");
      expect(p.tweets[0].text).toBe("newest tweet");
      expect(p.tweets[0].publicMetrics.like_count).toBe(10);
    });

    test("passes startTime and endTime to API", async () => {
      await callTool("twitter_get_my_tweets", {
        startTime: "2026-02-01T00:00:00Z",
        endTime: "2026-02-28T23:59:59Z",
      });
      const call = mockV2.userTimeline.mock.calls[0];
      const opts = call[1];
      expect(opts.start_time).toBe("2026-02-01T00:00:00Z");
      expect(opts.end_time).toBe("2026-02-28T23:59:59Z");
    });

    test("passes exclude filter to API", async () => {
      await callTool("twitter_get_my_tweets", { exclude: ["retweets", "replies"] });
      const opts = mockV2.userTimeline.mock.calls[0][1];
      expect(opts.exclude).toEqual(["retweets", "replies"]);
    });

    test("passes pagination token to API", async () => {
      await callTool("twitter_get_my_tweets", { paginationToken: "page2-token" });
      const opts = mockV2.userTimeline.mock.calls[0][1];
      expect(opts.pagination_token).toBe("page2-token");
    });

    test("passes maxResults to API", async () => {
      await callTool("twitter_get_my_tweets", { maxResults: 50 });
      const opts = mockV2.userTimeline.mock.calls[0][1];
      expect(opts.max_results).toBe(50);
    });

    test("handles empty results gracefully", async () => {
      mockV2.userTimeline.mockImplementation(async () => ({
        data: { data: null, meta: { result_count: 0 } },
      }));
      const p = parse(await callTool("twitter_get_my_tweets"));
      expect(p.resultCount).toBe(0);
      expect(p.tweets).toEqual([]);
      expect(p.newestTweetDate).toBeNull();
      expect(p.oldestTweetDate).toBeNull();
      expect(p.nextToken).toBeNull();
    });

    test("handles API error", async () => {
      mockV2.userTimeline.mockImplementation(async () => {
        throw new Error("Rate limit exceeded");
      });
      const r = await callTool("twitter_get_my_tweets");
      expect(r.isError).toBe(true);
      expect(parse(r).error).toContain("Rate limit");
    });
  });

  // ── twitter_get_user_tweets ───────────────────────────────────────────────

  describe("twitter_get_user_tweets", () => {
    test("passes userId to API and returns enriched response", async () => {
      const p = parse(await callTool("twitter_get_user_tweets", { userId: "999" }));
      expect(mockV2.userTimeline.mock.calls[0][0]).toBe("999");
      expect(p.userId).toBe("999");
      expect(p.resultCount).toBe(2);
      expect(p.nextToken).toBe("timeline-page2");
    });

    test("passes all optional params", async () => {
      await callTool("twitter_get_user_tweets", {
        userId: "999",
        maxResults: 100,
        startTime: "2026-01-01T00:00:00Z",
        endTime: "2026-02-01T00:00:00Z",
        exclude: ["retweets"],
        paginationToken: "tok",
      });
      const opts = mockV2.userTimeline.mock.calls[0][1];
      expect(opts.max_results).toBe(100);
      expect(opts.start_time).toBe("2026-01-01T00:00:00Z");
      expect(opts.exclude).toEqual(["retweets"]);
      expect(opts.pagination_token).toBe("tok");
    });
  });

  // ── twitter_search_tweets ─────────────────────────────────────────────────

  describe("twitter_search_tweets", () => {
    test("passes query and returns enriched response", async () => {
      const p = parse(await callTool("twitter_search_tweets", { query: "AI agents" }));
      expect(mockV2.search.mock.calls[0][0]).toBe("AI agents");
      expect(p.query).toBe("AI agents");
      expect(p.resultCount).toBe(1);
      expect(p.nextToken).toBe("search-page2");
      expect(p.tweets[0].authorId).toBe("222");
      expect(p.includes).toBeDefined();
    });

    test("passes date filters and sort order", async () => {
      await callTool("twitter_search_tweets", {
        query: "test",
        startTime: "2026-02-13T00:00:00Z",
        endTime: "2026-02-20T00:00:00Z",
        sortOrder: "recency",
      });
      const opts = mockV2.search.mock.calls[0][1];
      expect(opts.start_time).toBe("2026-02-13T00:00:00Z");
      expect(opts.end_time).toBe("2026-02-20T00:00:00Z");
      expect(opts.sort_order).toBe("recency");
    });

    test("maps paginationToken to next_token for search API", async () => {
      await callTool("twitter_search_tweets", { query: "test", paginationToken: "abc" });
      const opts = mockV2.search.mock.calls[0][1];
      expect(opts.next_token).toBe("abc");
      expect(opts.pagination_token).toBeUndefined();
    });

    test("handles empty search results", async () => {
      mockV2.search.mockImplementation(async () => ({ data: { data: null, meta: {} } }));
      const p = parse(await callTool("twitter_search_tweets", { query: "nonexistent" }));
      expect(p.resultCount).toBe(0);
      expect(p.tweets).toEqual([]);
    });
  });

  // ── twitter_get_tweet ─────────────────────────────────────────────────────

  describe("twitter_get_tweet", () => {
    test("returns full tweet details", async () => {
      const p = parse(await callTool("twitter_get_tweet", { tweetId: "tweet-1" }));
      expect(p.id).toBe("tweet-1");
      expect(p.text).toBe("hello world");
      expect(p.authorId).toBe("111");
      expect(p.createdAt).toBe("2026-02-20T10:00:00Z");
      expect(p.conversationId).toBe("conv-1");
      expect(p.includes).toBeDefined();
    });
  });

  // ── twitter_create_tweet ──────────────────────────────────────────────────

  describe("twitter_create_tweet", () => {
    test("creates simple tweet and passes correct text to API", async () => {
      const p = parse(await callTool("twitter_create_tweet", { text: "hello" }));
      expect(p.success).toBe(true);
      expect(p.tweetId).toBeDefined();
      expect(p.text).toBe("hello");
      expect(mockV2.tweet.mock.calls[0][0]).toBe("hello");
      expect(mockV2.tweet.mock.calls[0][1]).toEqual({});
    });

    test("creates reply", async () => {
      await callTool("twitter_create_tweet", { text: "reply", replyToTweetId: "123" });
      const callArgs = mockV2.tweet.mock.calls[0];
      expect(callArgs[1].reply.in_reply_to_tweet_id).toBe("123");
    });

    test("creates quote tweet", async () => {
      await callTool("twitter_create_tweet", { text: "check this", quoteTweetId: "456" });
      const callArgs = mockV2.tweet.mock.calls[0];
      expect(callArgs[1].quote_tweet_id).toBe("456");
    });
  });

  // ── twitter_create_thread ─────────────────────────────────────────────────

  describe("twitter_create_thread", () => {
    test("posts multi-tweet thread and returns URL", async () => {
      let callCount = 0;
      mockV2.tweet.mockImplementation(async (text: string) => {
        callCount++;
        return { data: { id: `thread-${callCount}`, text } };
      });

      const p = parse(
        await callTool("twitter_create_thread", {
          tweets: ["first tweet", "second tweet", "third tweet"],
        }),
      );

      expect(p.success).toBe(true);
      expect(p.threadLength).toBe(3);
      expect(p.tweets[0].id).toBe("thread-1");
      expect(p.tweets[2].id).toBe("thread-3");
      expect(p.threadUrl).toContain("thread-1");
    });

    test("chains replies correctly", async () => {
      let callCount = 0;
      mockV2.tweet.mockImplementation(async (text: string) => {
        callCount++;
        return { data: { id: `t-${callCount}`, text } };
      });

      await callTool("twitter_create_thread", { tweets: ["first", "second", "third"] });

      // First tweet: no reply params
      expect(mockV2.tweet.mock.calls[0][1]).toEqual({});
      // Second tweet: replies to first
      expect(mockV2.tweet.mock.calls[1][1].reply.in_reply_to_tweet_id).toBe("t-1");
      // Third tweet: replies to second
      expect(mockV2.tweet.mock.calls[2][1].reply.in_reply_to_tweet_id).toBe("t-2");
    });

    test("handles getTwitterClient failure (not connected)", async () => {
      mockOAuth.getValidTokenByPlatform.mockImplementation(async () => {
        throw new Error("No active connection");
      });
      const r = await callTool("twitter_create_thread", { tweets: ["a", "b"] });
      expect(r.isError).toBe(true);
      expect(parse(r).error).toContain("not connected");
    });

    test("reports partial results on mid-thread failure", async () => {
      let callCount = 0;
      mockV2.tweet.mockImplementation(async (text: string) => {
        callCount++;
        if (callCount === 3) throw new Error("Rate limit hit");
        return { data: { id: `t-${callCount}`, text } };
      });

      const r = await callTool("twitter_create_thread", {
        tweets: ["one", "two", "three", "four"],
      });

      expect(r.isError).toBe(true);
      const p = parse(r);
      expect(p.error).toContain("Rate limit hit");
      expect(p.partialThread).toHaveLength(2);
      expect(p.partialThread[0].id).toBe("t-1");
      expect(p.partialThread[1].id).toBe("t-2");
      expect(p.completedCount).toBe(2);
      expect(p.totalCount).toBe(4);
      expect(p.threadUrl).toContain("t-1");
    });
  });

  // ── twitter_resolve_tweet_url ─────────────────────────────────────────────

  describe("twitter_resolve_tweet_url", () => {
    test("resolves standard x.com URL", async () => {
      const p = parse(
        await callTool("twitter_resolve_tweet_url", {
          url: "https://x.com/user/status/12345",
        }),
      );
      expect(p.id).toBe("tweet-1");
      expect(p.sourceUrl).toBe("https://x.com/user/status/12345");
      expect(mockV2.singleTweet.mock.calls[0][0]).toBe("12345");
    });

    test("resolves twitter.com URL", async () => {
      await callTool("twitter_resolve_tweet_url", {
        url: "https://twitter.com/someone/status/67890",
      });
      expect(mockV2.singleTweet.mock.calls[0][0]).toBe("67890");
    });

    test("resolves mobile.twitter.com URL", async () => {
      await callTool("twitter_resolve_tweet_url", {
        url: "https://mobile.twitter.com/user/status/11111",
      });
      expect(mockV2.singleTweet.mock.calls[0][0]).toBe("11111");
    });

    test("handles URL with query params", async () => {
      await callTool("twitter_resolve_tweet_url", {
        url: "https://x.com/user/status/99999?s=20&t=abc",
      });
      expect(mockV2.singleTweet.mock.calls[0][0]).toBe("99999");
    });

    test("rejects invalid URL", async () => {
      const r = await callTool("twitter_resolve_tweet_url", {
        url: "https://example.com/not-a-tweet",
      });
      expect(r.isError).toBe(true);
      expect(parse(r).error).toContain("Could not extract tweet ID");
    });

    test("rejects t.co shortened URLs with specific hint", async () => {
      const r = await callTool("twitter_resolve_tweet_url", {
        url: "https://t.co/abc123",
      });
      expect(r.isError).toBe(true);
      expect(parse(r).error).toContain("t.co links are not supported");
    });
  });

  // ── twitter_check_relationship ────────────────────────────────────────────

  describe("twitter_check_relationship", () => {
    test("returns mutual follow status", async () => {
      const p = parse(
        await callTool("twitter_check_relationship", {
          sourceUsername: "testuser",
          targetUsername: "other",
        }),
      );
      expect(p.sourceFollowsTarget).toBe(true);
      expect(p.targetFollowsSource).toBe(true);
      expect(p.mutualFollow).toBe(true);
    });

    test("strips @ prefix from usernames", async () => {
      await callTool("twitter_check_relationship", {
        sourceUsername: "@testuser",
        targetUsername: "@other",
      });
      const call = mockV1.friendship.mock.calls[0][0];
      expect(call.source_screen_name).toBe("testuser");
      expect(call.target_screen_name).toBe("other");
    });

    test("returns non-mutual status", async () => {
      mockV1.friendship.mockImplementation(async () => ({
        source: { following: true, followed_by: false },
      }));
      const p = parse(
        await callTool("twitter_check_relationship", {
          sourceUsername: "a",
          targetUsername: "b",
        }),
      );
      expect(p.sourceFollowsTarget).toBe(true);
      expect(p.targetFollowsSource).toBe(false);
      expect(p.mutualFollow).toBe(false);
    });

    test("handles errors gracefully", async () => {
      mockV1.friendship.mockImplementation(async () => {
        throw new Error("User suspended");
      });
      const r = await callTool("twitter_check_relationship", {
        sourceUsername: "a",
        targetUsername: "b",
      });
      expect(r.isError).toBe(true);
      expect(parse(r).error).toContain("User suspended");
    });
  });

  // ── twitter_follow_user / twitter_unfollow_user ───────────────────────────

  describe("twitter_follow_user", () => {
    test("follows by userId", async () => {
      const p = parse(await callTool("twitter_follow_user", { targetUserId: "999" }));
      expect(p.success).toBe(true);
      expect(p.following).toBe(true);
      expect(p.targetUserId).toBe("999");
    });

    test("follows by username (auto-resolves ID)", async () => {
      const p = parse(await callTool("twitter_follow_user", { username: "otheruser" }));
      expect(p.success).toBe(true);
      expect(mockV2.userByUsername).toHaveBeenCalledWith("otheruser");
      expect(p.targetUserId).toBe("222");
    });

    test("returns error when neither userId nor username provided", async () => {
      const r = await callTool("twitter_follow_user", {});
      expect(r.isError).toBe(true);
      expect(parse(r).error).toContain("Provide either");
    });
  });

  describe("twitter_unfollow_user", () => {
    test("unfollows by username", async () => {
      const p = parse(await callTool("twitter_unfollow_user", { username: "someone" }));
      expect(p.success).toBe(true);
      expect(p.following).toBe(false);
    });
  });

  // ── twitter_get_mentions ──────────────────────────────────────────────────

  describe("twitter_get_mentions", () => {
    test("returns mentions with metadata", async () => {
      const p = parse(await callTool("twitter_get_mentions"));
      expect(p.resultCount).toBe(1);
      expect(p.tweets[0].text).toContain("@testuser");
      expect(p.tweets[0].authorId).toBe("333");
      expect(p.includes).toBeDefined();
    });

    test("passes date filters", async () => {
      await callTool("twitter_get_mentions", {
        startTime: "2026-02-19T00:00:00Z",
        endTime: "2026-02-20T00:00:00Z",
      });
      const opts = mockV2.userMentionTimeline.mock.calls[0][1];
      expect(opts.start_time).toBe("2026-02-19T00:00:00Z");
      expect(opts.end_time).toBe("2026-02-20T00:00:00Z");
    });
  });

  // ── twitter_get_liked_tweets ──────────────────────────────────────────────

  describe("twitter_get_liked_tweets", () => {
    test("returns liked tweets with pagination", async () => {
      const p = parse(await callTool("twitter_get_liked_tweets"));
      expect(p.resultCount).toBe(1);
      expect(p.tweets[0].id).toBe("l1");
      expect(p.nextToken).toBe("likes-page2");
    });
  });

  // ── twitter_get_bookmarks ─────────────────────────────────────────────────

  describe("twitter_get_bookmarks", () => {
    test("handles empty bookmarks", async () => {
      const p = parse(await callTool("twitter_get_bookmarks"));
      expect(p.resultCount).toBe(0);
      expect(p.tweets).toEqual([]);
    });

    test("returns descriptive error on OAuth 2.0 failure", async () => {
      mockV2.bookmarks.mockImplementation(async () => {
        throw "not an Error object";
      });
      const r = await callTool("twitter_get_bookmarks");
      expect(r.isError).toBe(true);
      expect(parse(r).error).toContain("OAuth 2.0");
    });
  });

  // ── twitter_get_followers / twitter_get_following ─────────────────────────

  describe("twitter_get_followers", () => {
    test("returns followers with pagination", async () => {
      const p = parse(await callTool("twitter_get_followers", { userId: "111" }));
      expect(p.resultCount).toBe(1);
      expect(p.nextToken).toBe("followers-page2");
      expect(p.followers[0].username).toBe("follower1");
    });

    test("passes pagination token", async () => {
      await callTool("twitter_get_followers", { userId: "111", paginationToken: "pg2" });
      const opts = mockV2.followers.mock.calls[0][1];
      expect(opts.pagination_token).toBe("pg2");
    });
  });

  describe("twitter_get_following", () => {
    test("returns following list", async () => {
      const p = parse(await callTool("twitter_get_following", { userId: "111" }));
      expect(p.resultCount).toBe(1);
      expect(p.following[0].username).toBe("following1");
      expect(p.following[0].verified).toBe(true);
    });
  });

  // ── Engagement tools ──────────────────────────────────────────────────────

  describe("Engagement tools", () => {
    test("like_tweet returns success", async () => {
      const p = parse(await callTool("twitter_like_tweet", { tweetId: "t1" }));
      expect(p.success).toBe(true);
      expect(p.liked).toBe(true);
    });

    test("unlike_tweet returns success", async () => {
      const p = parse(await callTool("twitter_unlike_tweet", { tweetId: "t1" }));
      expect(p.liked).toBe(false);
    });

    test("retweet returns success", async () => {
      const p = parse(await callTool("twitter_retweet", { tweetId: "t1" }));
      expect(p.retweeted).toBe(true);
    });

    test("unretweet returns success", async () => {
      const p = parse(await callTool("twitter_unretweet", { tweetId: "t1" }));
      expect(p.retweeted).toBe(false);
    });

    test("delete_tweet returns success", async () => {
      const p = parse(await callTool("twitter_delete_tweet", { tweetId: "t1" }));
      expect(p.deleted).toBe(true);
    });

    test("like_tweet returns error on API failure", async () => {
      mockV2.like.mockImplementation(async () => {
        throw new Error("Already liked");
      });
      const r = await callTool("twitter_like_tweet", { tweetId: "t1" });
      expect(r.isError).toBe(true);
      expect(parse(r).error).toContain("Already liked");
    });

    test("retweet returns error on API failure", async () => {
      mockV2.retweet.mockImplementation(async () => {
        throw new Error("Duplicate retweet");
      });
      const r = await callTool("twitter_retweet", { tweetId: "t1" });
      expect(r.isError).toBe(true);
      expect(parse(r).error).toContain("Duplicate retweet");
    });

    test("delete_tweet returns error on API failure", async () => {
      mockV2.deleteTweet.mockImplementation(async () => {
        throw new Error("Not authorized");
      });
      const r = await callTool("twitter_delete_tweet", { tweetId: "t1" });
      expect(r.isError).toBe(true);
      expect(parse(r).error).toContain("Not authorized");
    });
  });

  // ── Edge cases & error handling ───────────────────────────────────────────

  describe("Edge cases", () => {
    test("errMsg formats rate limit info", async () => {
      const rateLimitError = Object.assign(new Error("Too Many Requests"), {
        code: 429,
        data: { detail: "Rate limit exceeded" },
        rateLimit: { remaining: 0, reset: Math.floor(Date.now() / 1000) + 900 },
      });
      mockV2.search.mockImplementation(async () => {
        throw rateLimitError;
      });

      const r = await callTool("twitter_search_tweets", { query: "test" });
      expect(r.isError).toBe(true);
      const msg = parse(r).error;
      expect(msg).toContain("Too Many Requests");
      expect(msg).toContain("Rate limit exceeded");
      expect(msg).toContain("code: 429");
      expect(msg).toContain("rate limit resets at");
    });

    test("handles non-Error thrown objects", async () => {
      mockV2.search.mockImplementation(async () => {
        throw "string error";
      });
      const r = await callTool("twitter_search_tweets", { query: "test" });
      expect(r.isError).toBe(true);
      expect(parse(r).error).toBe("Failed to search tweets");
    });

    test("concurrent requests isolate auth context", async () => {
      const results = await Promise.all([
        callTool("twitter_status", {}, "org-A"),
        callTool("twitter_status", {}, "org-B"),
        callTool("twitter_status", {}, "org-C"),
      ]);

      for (const r of results) {
        expect(parse(r).connected).toBe(true);
      }
      expect(mockOAuth.listConnections.mock.calls.length).toBe(3);
    });

    test("mapTweetSummary includes referencedTweets only when present", async () => {
      const p = parse(await callTool("twitter_get_my_tweets"));
      expect(p.tweets[0].referencedTweets).toBeUndefined();
      expect(p.tweets[1].referencedTweets).toBeDefined();
      expect(p.tweets[1].referencedTweets[0].type).toBe("retweeted");
    });

    test("twitter_get_user returns error for nonexistent user", async () => {
      mockV2.userByUsername.mockImplementation(async () => ({ data: undefined }));
      const r = await callTool("twitter_get_user", { username: "nobody" });
      expect(r.isError).toBe(true);
      expect(parse(r).error).toContain("@nobody not found");
    });

    test("paginatedTweetResponse handles undefined meta", async () => {
      mockV2.userTimeline.mockImplementation(async () => ({
        data: {
          data: [
            { id: "t1", text: "solo", created_at: "2026-02-20T00:00:00Z", public_metrics: {} },
          ],
        },
      }));
      const p = parse(await callTool("twitter_get_my_tweets"));
      expect(p.resultCount).toBe(1);
      expect(p.nextToken).toBeNull();
      expect(p.newestTweetDate).toBe("2026-02-20T00:00:00Z");
    });

    test("twitter not connected shows helpful message", async () => {
      mockOAuth.getValidTokenByPlatform.mockImplementation(async () => {
        throw new Error("No active connection");
      });
      const r = await callTool("twitter_get_my_tweets");
      expect(r.isError).toBe(true);
      expect(parse(r).error).toContain("not connected");
    });

    test("missing accessTokenSecret returns a specific reconnect error", async () => {
      mockOAuth.getValidTokenByPlatform.mockImplementation(async () => ({
        accessToken: "tok",
        accessTokenSecret: "",
        refreshed: false,
        fromCache: false,
      }));
      const r = await callTool("twitter_get_me");
      expect(r.isError).toBe(true);
      expect(parse(r).error).toContain("access token secret is missing");
    });
  });
});

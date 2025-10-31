import { createPaidMcpHandler } from "x402-mcp";
import z from "zod";
import { facilitator } from "@coinbase/x402";
import { getOrCreateSellerAccount, env } from "@/lib/accounts";
import { TwitterApi } from "twitter-api-v2";
import type { Account } from "viem/accounts";

// Twitter API v2 client setup
const twitterClient = new TwitterApi(process.env.TWITTER_BEARER_TOKEN || "");

let cachedHandler: ((request: Request) => Promise<Response>) | null = null;
let sellerAccountPromise: Promise<Account> | null = null;

async function getHandler() {
  if (cachedHandler) {
    return cachedHandler;
  }

  if (!sellerAccountPromise) {
    sellerAccountPromise = getOrCreateSellerAccount();
  }
  const sellerAccount = await sellerAccountPromise;

  cachedHandler = createPaidMcpHandler(
    (server) => {
      // Tool 1: Get Trending Topics
      server.paidTool(
        "get_trending_topics",
        "Get trending topics on Twitter/X for a specific location. Pay $0.10 to fetch current trending hashtags and topics.",
        { price: 0.1 },
        {
          woeid: z
            .number()
            .int()
            .optional()
            .describe(
              "Where On Earth ID for location (default: 1 for worldwide). Common: 1=Worldwide, 2459115=New York, 2487956=San Francisco, 2442047=Los Angeles",
            ) as any,
        },
        {},
        async (args) => {
          try {
            const { woeid = 1 } = args as { woeid?: number };

            // Note: Trends endpoint requires elevated access in Twitter API v2
            // Using trending tweets as alternative
            const tweets = await twitterClient.v2.search(
              "lang:en -is:retweet",
              {
                max_results: 10,
                "tweet.fields": ["public_metrics", "created_at"],
                sort_order: "relevancy",
              },
            );

            const trends = tweets.data.data.map((tweet) => ({
              text: tweet.text.substring(0, 100),
              engagement:
                (tweet.public_metrics?.like_count || 0) +
                (tweet.public_metrics?.retweet_count || 0),
            }));

            trends.sort((a, b) => b.engagement - a.engagement);

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      location: woeid === 1 ? "Worldwide" : `WOEID: ${woeid}`,
                      trending_content: trends,
                      timestamp: new Date().toISOString(),
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          } catch (error: any) {
            console.error("Twitter trends error:", error);
            return {
              content: [
                {
                  type: "text",
                  text: `Failed to fetch trending topics: ${error.message || "Unknown error"}`,
                },
              ],
              isError: true,
            };
          }
        },
      );

      // Tool 2: Search Tweets
      server.paidTool(
        "search_tweets",
        "Search recent tweets on Twitter/X. Pay $0.05 per search query. Returns up to 10 recent tweets matching your search query.",
        { price: 0.05 },
        {
          query: z
            .string()
            .describe(
              "Search query (supports operators like from:username, #hashtag, lang:en)",
            ) as any,
          max_results: z
            .number()
            .int()
            .min(10)
            .max(100)
            .optional()
            .describe("Maximum number of results (10-100, default: 10)") as any,
          sort_order: z
            .enum(["recency", "relevancy"])
            .optional()
            .describe(
              "Sort order: recency or relevancy (default: recency)",
            ) as any,
        },
        {},
        async (args) => {
          try {
            const {
              query,
              max_results = 10,
              sort_order = "recency",
            } = args as {
              query: string;
              max_results?: number;
              sort_order?: "recency" | "relevancy";
            };

            if (!query) {
              throw new Error("Query is required");
            }

            const result = await twitterClient.v2.search(query, {
              max_results: Math.min(max_results, 100),
              "tweet.fields": [
                "created_at",
                "public_metrics",
                "author_id",
                "conversation_id",
              ],
              "user.fields": ["username", "name", "verified"],
              expansions: ["author_id"],
              sort_order: sort_order,
            });

            const tweets = result.data.data.map((tweet) => {
              const author = result.includes?.users?.find(
                (u) => u.id === tweet.author_id,
              );
              return {
                id: tweet.id,
                text: tweet.text,
                author: author
                  ? {
                      username: author.username,
                      name: author.name,
                      verified: author.verified || false,
                    }
                  : null,
                created_at: tweet.created_at,
                metrics: {
                  likes: tweet.public_metrics?.like_count || 0,
                  retweets: tweet.public_metrics?.retweet_count || 0,
                  replies: tweet.public_metrics?.reply_count || 0,
                },
                url: `https://twitter.com/i/web/status/${tweet.id}`,
              };
            });

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      query: query,
                      result_count: tweets.length,
                      tweets: tweets,
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          } catch (error: any) {
            console.error("Twitter search error:", error);
            return {
              content: [
                {
                  type: "text",
                  text: `Failed to search tweets: ${error.message || "Unknown error"}`,
                },
              ],
              isError: true,
            };
          }
        },
      );

      // Tool 3: Get User Info
      server.paidTool(
        "get_user_info",
        "Get detailed information about a Twitter/X user by username. Pay $0.03 to fetch user profile data including follower count, bio, and verification status.",
        { price: 0.03 },
        {
          username: z.string().describe("Twitter username (without @)") as any,
        },
        {},
        async (args) => {
          try {
            const { username } = args as { username: string };

            if (!username) {
              throw new Error("Username is required");
            }

            const user = await twitterClient.v2.userByUsername(username, {
              "user.fields": [
                "created_at",
                "description",
                "public_metrics",
                "verified",
                "profile_image_url",
                "location",
              ],
            });

            if (!user.data) {
              throw new Error("User not found");
            }

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      id: user.data.id,
                      username: user.data.username,
                      name: user.data.name,
                      bio: user.data.description,
                      verified: user.data.verified || false,
                      created_at: user.data.created_at,
                      location: user.data.location,
                      profile_image: user.data.profile_image_url,
                      metrics: {
                        followers:
                          user.data.public_metrics?.followers_count || 0,
                        following:
                          user.data.public_metrics?.following_count || 0,
                        tweets: user.data.public_metrics?.tweet_count || 0,
                      },
                      url: `https://twitter.com/${user.data.username}`,
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          } catch (error: any) {
            console.error("Twitter user info error:", error);
            return {
              content: [
                {
                  type: "text",
                  text: `Failed to get user info: ${error.message || "Unknown error"}`,
                },
              ],
              isError: true,
            };
          }
        },
      );
    },
    {
      serverInfo: {
        name: "twitter-data-api",
        version: "1.0.0",
      },
    },
    {
      recipient: sellerAccount.address,
      facilitator,
      network: env.NETWORK,
    },
  );

  return cachedHandler;
}

export async function GET(request: Request) {
  const handler = await getHandler();
  return handler(request);
}

export async function POST(request: Request) {
  const handler = await getHandler();
  return handler(request);
}

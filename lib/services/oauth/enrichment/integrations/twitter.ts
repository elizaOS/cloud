/**
 * Twitter Enrichment
 *
 * Fetches identity context from Twitter API v2.
 * Extracts: username, name, bio, followers, recent tweets
 *
 * Uses OAuth 1.0a User Context via twitter-api-v2 library.
 * Requires both accessToken AND accessTokenSecret.
 */

import { TwitterApi } from "twitter-api-v2";
import { logger } from "@/lib/utils/logger";

const TWITTER_API_KEY = process.env.TWITTER_API_KEY || "";
const TWITTER_API_SECRET_KEY = process.env.TWITTER_API_SECRET_KEY || "";

interface RecentTweet {
  text: string;
  createdAt: string;
  isReply: boolean;
}

export interface TwitterEnrichmentData {
  username: string;
  name: string;
  bio: string | null;
  location: string | null;
  website: string | null;
  followersCount: number;
  followingCount: number;
  tweetCount: number;
  verified: boolean;
  createdAt: string;
  pinnedTweet: string | null;
  recentTweets: RecentTweet[];
}

export async function enrichTwitter(
  accessToken: string,
  accessTokenSecret?: string
): Promise<TwitterEnrichmentData> {
  if (!TWITTER_API_KEY || !TWITTER_API_SECRET_KEY) {
    throw new Error("Twitter API credentials not configured");
  }

  if (!accessTokenSecret) {
    throw new Error("Twitter requires accessTokenSecret for OAuth 1.0a");
  }

  const client = new TwitterApi({
    appKey: TWITTER_API_KEY,
    appSecret: TWITTER_API_SECRET_KEY,
    accessToken,
    accessSecret: accessTokenSecret,
  });

  // Fetch user profile
  const me = await client.v2.me({
    "user.fields": [
      "description",
      "public_metrics",
      "profile_image_url",
      "created_at",
      "location",
      "url",
      "verified",
      "pinned_tweet_id",
    ],
  });

  if (!me.data) {
    throw new Error("Failed to fetch Twitter profile");
  }

  const user = me.data;
  const metrics = user.public_metrics;

  // Fetch pinned tweet if exists
  let pinnedTweet: string | null = null;
  if (user.pinned_tweet_id) {
    const pinned = await client.v2.singleTweet(user.pinned_tweet_id, {
      "tweet.fields": ["text"],
    }).catch(() => null);
    pinnedTweet = pinned?.data?.text ?? null;
  }

  // Fetch recent tweets (up to 10)
  const recentTweets: RecentTweet[] = [];
  const timeline = await client.v2.userTimeline(user.id, {
    max_results: 10,
    exclude: ["retweets"],
    "tweet.fields": ["created_at", "in_reply_to_user_id"],
  }).catch((err) => {
    logger.warn("[enrichTwitter] Failed to fetch timeline", { error: String(err) });
    return null;
  });

  if (timeline?.data?.data) {
    for (const tweet of timeline.data.data) {
      recentTweets.push({
        text: tweet.text,
        createdAt: tweet.created_at || "",
        isReply: !!tweet.in_reply_to_user_id,
      });
    }
  }

  logger.info("[enrichTwitter] Enrichment successful", {
    username: user.username,
    tweetCount: recentTweets.length,
  });

  return {
    username: user.username,
    name: user.name,
    bio: user.description ?? null,
    location: user.location ?? null,
    website: user.url ?? null,
    followersCount: metrics?.followers_count ?? 0,
    followingCount: metrics?.following_count ?? 0,
    tweetCount: metrics?.tweet_count ?? 0,
    verified: user.verified ?? false,
    createdAt: user.created_at ?? "",
    pinnedTweet,
    recentTweets,
  };
}

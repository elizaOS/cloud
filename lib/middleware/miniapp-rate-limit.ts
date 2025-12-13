/**
 * Rate Limiting Middleware for Miniapp APIs
 * 
 * Implements dual-layer rate limiting:
 * 1. User/API Key level - protects individual users from abuse
 * 2. App/Origin level - protects the system from misbehaving applications
 * 
 * Production: Uses Redis for distributed rate limiting
 * Development: Uses in-memory storage
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimitRedis } from "./rate-limit-redis";
import { logger } from "@/lib/utils/logger";

// In-memory fallback for development
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

// Clean up expired entries
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}, 60000);

/**
 * Rate limit configuration for miniapp APIs
 */
export interface MiniappRateLimitConfig {
  // User-level limits (per API key or user)
  userWindowMs: number;
  userMaxRequests: number;
  
  // App-level limits (per miniapp origin)
  appWindowMs: number;
  appMaxRequests: number;
}

/**
 * Default rate limits for miniapp APIs
 * 
 * User limits: 100 requests per minute
 * App limits: 1000 requests per minute (aggregate across all users of an app)
 */
export const MINIAPP_RATE_LIMITS: MiniappRateLimitConfig = {
  userWindowMs: 60000,      // 1 minute
  userMaxRequests: process.env.NODE_ENV === "production" ? 100 : 10000,
  appWindowMs: 60000,       // 1 minute
  appMaxRequests: process.env.NODE_ENV === "production" ? 1000 : 100000,
};

/**
 * Stricter limits for expensive operations (create, update, delete)
 */
export const MINIAPP_WRITE_LIMITS: MiniappRateLimitConfig = {
  userWindowMs: 60000,
  userMaxRequests: process.env.NODE_ENV === "production" ? 30 : 10000,
  appWindowMs: 60000,
  appMaxRequests: process.env.NODE_ENV === "production" ? 300 : 100000,
};

/**
 * Check rate limit (in-memory fallback)
 */
function checkInMemoryRateLimit(
  key: string,
  windowMs: number,
  maxRequests: number
): { allowed: boolean; remaining: number; resetAt: number; retryAfter?: number } {
  const now = Date.now();
  let entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + windowMs };
    rateLimitStore.set(key, entry);
  }

  entry.count++;

  const allowed = entry.count <= maxRequests;
  const remaining = Math.max(0, maxRequests - entry.count);
  const retryAfter = allowed ? undefined : Math.ceil((entry.resetAt - now) / 1000);

  return { allowed, remaining, resetAt: entry.resetAt, retryAfter };
}

/**
 * Check rate limit using Redis or fallback to in-memory
 */
async function checkRateLimit(
  key: string,
  windowMs: number,
  maxRequests: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number; retryAfter?: number }> {
  const useRedis = process.env.REDIS_RATE_LIMITING === "true";
  
  if (useRedis) {
    return checkRateLimitRedis(key, windowMs, maxRequests);
  }
  
  return checkInMemoryRateLimit(key, windowMs, maxRequests);
}

/**
 * Extract rate limit key identifiers from request
 */
function extractKeys(request: NextRequest): { userKey: string; appKey: string } {
  // User key from API key or auth header
  const authHeader = request.headers.get("authorization");
  const apiKey = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  
  // Fall back to IP for non-authenticated requests
  const ip = request.headers.get("x-real-ip") 
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() 
    || "unknown";
  
  const userKey = apiKey 
    ? `miniapp:user:${apiKey.slice(0, 20)}` // Use prefix of API key for privacy
    : `miniapp:ip:${ip}`;
  
  // App key from origin
  const origin = request.headers.get("origin") || "unknown";
  const appKey = `miniapp:app:${origin}`;
  
  return { userKey, appKey };
}

/**
 * Add rate limit headers to response
 */
function addRateLimitHeaders(
  headers: Headers,
  userResult: { remaining: number; resetAt: number },
  appResult: { remaining: number; resetAt: number },
  config: MiniappRateLimitConfig
): void {
  headers.set("X-RateLimit-Limit-User", config.userMaxRequests.toString());
  headers.set("X-RateLimit-Remaining-User", userResult.remaining.toString());
  headers.set("X-RateLimit-Reset-User", new Date(userResult.resetAt).toISOString());
  
  headers.set("X-RateLimit-Limit-App", config.appMaxRequests.toString());
  headers.set("X-RateLimit-Remaining-App", appResult.remaining.toString());
  headers.set("X-RateLimit-Reset-App", new Date(appResult.resetAt).toISOString());
}

/**
 * Rate limit result with both user and app status
 */
export interface RateLimitResult {
  allowed: boolean;
  userRemaining: number;
  appRemaining: number;
  retryAfter?: number;
  limitType?: "user" | "app";
}

/**
 * Check both user and app rate limits
 */
export async function checkMiniappRateLimit(
  request: NextRequest,
  config: MiniappRateLimitConfig = MINIAPP_RATE_LIMITS
): Promise<RateLimitResult> {
  const { userKey, appKey } = extractKeys(request);
  
  // Check both limits concurrently
  const [userResult, appResult] = await Promise.all([
    checkRateLimit(userKey, config.userWindowMs, config.userMaxRequests),
    checkRateLimit(appKey, config.appWindowMs, config.appMaxRequests),
  ]);
  
  // If either limit exceeded, deny the request
  if (!userResult.allowed) {
    logger.warn("[Miniapp Rate Limit] User limit exceeded", { 
      key: userKey.slice(0, 30),
      limit: config.userMaxRequests,
    });
    return {
      allowed: false,
      userRemaining: userResult.remaining,
      appRemaining: appResult.remaining,
      retryAfter: userResult.retryAfter,
      limitType: "user",
    };
  }
  
  if (!appResult.allowed) {
    logger.warn("[Miniapp Rate Limit] App limit exceeded", { 
      key: appKey,
      limit: config.appMaxRequests,
    });
    return {
      allowed: false,
      userRemaining: userResult.remaining,
      appRemaining: appResult.remaining,
      retryAfter: appResult.retryAfter,
      limitType: "app",
    };
  }
  
  return {
    allowed: true,
    userRemaining: userResult.remaining,
    appRemaining: appResult.remaining,
  };
}

/**
 * Create rate limit error response
 */
export function createRateLimitErrorResponse(
  result: RateLimitResult,
  corsOrigin?: string
): NextResponse {
  const response = NextResponse.json(
    {
      success: false,
      error: "Rate limit exceeded",
      message: result.limitType === "user"
        ? "You have made too many requests. Please slow down."
        : "This application has exceeded its rate limit. Please try again later.",
      retryAfter: result.retryAfter,
    },
    {
      status: 429,
      headers: {
        "Retry-After": result.retryAfter?.toString() || "60",
        "X-RateLimit-Remaining-User": result.userRemaining.toString(),
        "X-RateLimit-Remaining-App": result.appRemaining.toString(),
      },
    }
  );
  
  if (corsOrigin) {
    response.headers.set("Access-Control-Allow-Origin", corsOrigin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
  }
  
  return response;
}

/**
 * Add rate limit info to a successful response
 */
export function addRateLimitInfoToResponse(
  response: NextResponse,
  result: RateLimitResult,
  config: MiniappRateLimitConfig = MINIAPP_RATE_LIMITS
): NextResponse {
  response.headers.set("X-RateLimit-Limit-User", config.userMaxRequests.toString());
  response.headers.set("X-RateLimit-Remaining-User", result.userRemaining.toString());
  response.headers.set("X-RateLimit-Limit-App", config.appMaxRequests.toString());
  response.headers.set("X-RateLimit-Remaining-App", result.appRemaining.toString());
  
  return response;
}


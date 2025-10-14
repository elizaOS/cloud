/**
 * Rate Limiting Middleware
 * Implements multiple rate limiting strategies for API protection
 */

import { NextRequest, NextResponse } from "next/server";

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (request: NextRequest) => string; // Custom key generator
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store for rate limiting
// ⚠️  WARNING: This implementation uses in-memory storage and will NOT work correctly
// in multi-instance deployments. Each instance will have its own rate limit counter,
// allowing users to bypass limits by hitting different instances.
// 
// PRODUCTION REQUIREMENTS:
// - Use Redis for distributed rate limiting (recommended: ioredis + rate-limiter-flexible)
// - Or use database-backed rate limiting with proper locking
// - Configure rate limit key to include instance-agnostic identifier
//
// TODO: Migrate to Redis-backed rate limiting for production multi-instance deployments
const rateLimitStore = new Map<string, RateLimitEntry>();

// Log warning on first use
let hasLoggedWarning = false;
function logRateLimitWarning() {
  if (!hasLoggedWarning && process.env.NODE_ENV === "production") {
    console.warn(
      "⚠️  WARNING: Using in-memory rate limiting. This will not work correctly in multi-instance deployments. " +
      "Configure Redis-backed rate limiting for production. See lib/middleware/rate-limit.ts"
    );
    hasLoggedWarning = true;
  }
}

/**
 * Clean up expired entries periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}, 60000); // Clean every minute

/**
 * Generate rate limit key from request
 */
function getDefaultKey(request: NextRequest): string {
  // Try to get user ID from auth header or IP address
  const apiKey = request.headers.get("authorization")?.replace("Bearer ", "");
  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
  
  return apiKey || `ip:${ip}`;
}

/**
 * Check rate limit for a request
 */
export function checkRateLimit(
  request: NextRequest,
  config: RateLimitConfig
): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
} {
  logRateLimitWarning();
  
  const keyGenerator = config.keyGenerator || getDefaultKey;
  const key = keyGenerator(request);
  const now = Date.now();

  let entry = rateLimitStore.get(key);

  // Create new entry if doesn't exist or expired
  if (!entry || entry.resetAt < now) {
    entry = {
      count: 0,
      resetAt: now + config.windowMs,
    };
    rateLimitStore.set(key, entry);
  }

  // Increment count
  entry.count++;

  const allowed = entry.count <= config.maxRequests;
  const remaining = Math.max(0, config.maxRequests - entry.count);
  const retryAfter = allowed ? undefined : Math.ceil((entry.resetAt - now) / 1000);

  if (!allowed) {
    console.warn("Rate limit exceeded", {
      key,
      count: entry.count,
      max: config.maxRequests,
      resetAt: new Date(entry.resetAt).toISOString(),
    });
  }

  return {
    allowed,
    remaining,
    resetAt: entry.resetAt,
    retryAfter,
  };
}

/**
 * Rate limit middleware wrapper for API routes
 * Compatible with Next.js 15 where params is a Promise
 * Supports both NextResponse and Response return types
 */
export function withRateLimit<T = Record<string, string>>(
  handler: (request: NextRequest, context?: { params: Promise<T> }) => Promise<Response>,
  config: RateLimitConfig
) {
  return async (request: NextRequest, context?: { params: Promise<T> }): Promise<Response> => {
    const result = checkRateLimit(request, config);

    // Add rate limit headers
    const headers = {
      "X-RateLimit-Limit": config.maxRequests.toString(),
      "X-RateLimit-Remaining": result.remaining.toString(),
      "X-RateLimit-Reset": new Date(result.resetAt).toISOString(),
    };

    if (!result.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Too many requests",
          retryAfter: result.retryAfter,
        },
        {
          status: 429,
          headers: {
            ...headers,
            "Retry-After": result.retryAfter?.toString() || "60",
          },
        }
      );
    }

    // Call the actual handler
    const response = await handler(request, context);

    // Add rate limit headers to successful responses
    // Create new response with additional headers to preserve immutability
    const newHeaders = new Headers(response.headers);
    for (const [key, value] of Object.entries(headers)) {
      newHeaders.set(key, value);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  };
}

/**
 * Preset rate limit configurations
 */
export const RateLimitPresets = {
  // Generous limits for general API usage
  STANDARD: {
    windowMs: 60000, // 1 minute
    maxRequests: 60, // 60 requests per minute
  },

  // Strict limits for expensive operations
  STRICT: {
    windowMs: 60000, // 1 minute
    maxRequests: 10, // 10 requests per minute
  },

  // Very strict for critical operations (deployments, payments)
  CRITICAL: {
    windowMs: 300000, // 5 minutes
    maxRequests: 5, // 5 deployments per 5 minutes
  },

  // Burst allowance for real-time features
  BURST: {
    windowMs: 1000, // 1 second
    maxRequests: 10, // 10 requests per second
  },
} as const;

/**
 * Cost-based rate limiting for expensive operations
 */
export interface CostBasedRateLimitConfig {
  windowMs: number;
  maxCost: number; // Maximum total cost in the window
  getCost: (request: NextRequest) => number | Promise<number>;
}

const costLimitStore = new Map<string, { totalCost: number; resetAt: number }>();

/**
 * Check cost-based rate limit
 */
export async function checkCostBasedRateLimit(
  request: NextRequest,
  config: CostBasedRateLimitConfig
): Promise<{
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
}> {
  const key = getDefaultKey(request);
  const now = Date.now();
  const cost = await config.getCost(request);

  let entry = costLimitStore.get(key);

  if (!entry || entry.resetAt < now) {
    entry = {
      totalCost: 0,
      resetAt: now + config.windowMs,
    };
    costLimitStore.set(key, entry);
  }

  entry.totalCost += cost;

  const allowed = entry.totalCost <= config.maxCost;
  const remaining = Math.max(0, config.maxCost - entry.totalCost);
  const retryAfter = allowed ? undefined : Math.ceil((entry.resetAt - now) / 1000);

  if (!allowed) {
    console.warn("Cost-based rate limit exceeded", {
      key,
      cost,
      totalCost: entry.totalCost,
      maxCost: config.maxCost,
    });
  }

  return {
    allowed,
    remaining,
    retryAfter,
  };
}

/**
 * Clean up cost limit store periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of costLimitStore.entries()) {
    if (entry.resetAt < now) {
      costLimitStore.delete(key);
    }
  }
}, 60000);


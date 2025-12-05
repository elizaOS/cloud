import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { anonymousSessionsService } from "@/lib/services";
import { logger } from "@/lib/utils/logger";
import { db } from "@/db/client";
import { anonymousSessions } from "@/db/schemas";
import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";

/**
 * Simple in-memory rate limiter for this endpoint
 *
 * ⚠️  NOTE: This is a "soft" rate limit for UX purposes only.
 * In production with multiple serverless instances, each instance maintains its own map,
 * so the effective limit is multiplied by the number of instances.
 *
 * This is acceptable for this endpoint because:
 * 1. It only controls message count increments (not a security-critical operation)
 * 2. Actual abuse prevention is handled by the database-level message limits
 * 3. This provides basic DoS protection and prevents accidental client bugs
 *
 * For stricter rate limiting, use the Redis-backed rate limiter in lib/middleware/rate-limit.ts
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 20; // 20 requests per minute per IP

/**
 * Hash a token for safe logging (prevents partial token exposure)
 */
function hashTokenForLogging(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 8);
}

/**
 * Check rate limit for an IP address
 */
function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1 };
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - entry.count };
}

/**
 * Validate session token format
 *
 * Accepts:
 * - UUID format: 8-4-4-4-12 hex characters (e.g., "550e8400-e29b-41d4-a716-446655440000")
 * - nanoid format: 20-64 alphanumeric characters with _ and - (e.g., "V1StGXR8_Z5jdHi6B-myT")
 */
function isValidTokenFormat(token: string): boolean {
  if (typeof token !== "string" || token.length < 16 || token.length > 64) {
    return false;
  }

  // UUID format (standard 8-4-4-4-12 pattern)
  const uuidPattern =
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

  // nanoid format (alphanumeric + _ and -, 20-64 chars)
  // nanoid(32) produces URL-safe characters: A-Za-z0-9_-
  const nanoidPattern = /^[A-Za-z0-9_-]{20,64}$/;

  return uuidPattern.test(token) || nanoidPattern.test(token);
}

/**
 * POST /api/anonymous-session/increment
 *
 * Directly increment the message count for an anonymous session.
 * This is called by the frontend after a message is successfully sent.
 *
 * This provides a reliable fallback mechanism for message counting,
 * bypassing any potential issues in the complex auth flow.
 *
 * Security:
 * - Rate limited per IP address
 * - Input validation for token format
 * - Uses query builder (not raw SQL) to prevent injection
 * - Tokens are hashed for logging
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limiting - use trusted headers for IP detection
    // Priority: x-real-ip (Vercel) > x-forwarded-for (first IP) > fallback
    // Note: x-forwarded-for can be spoofed by clients, but x-real-ip is set by the proxy
    const realIp = request.headers.get("x-real-ip");
    const forwardedFor = request.headers.get("x-forwarded-for");
    const clientIp =
      realIp?.trim() || forwardedFor?.split(",")[0]?.trim() || "unknown";

    const rateLimit = checkRateLimit(clientIp);
    if (!rateLimit.allowed) {
      logger.warn("[Increment API] Rate limit exceeded for IP");
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": "60",
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }

    const body = await request.json();
    const { sessionToken } = body;

    // Input validation
    if (!sessionToken || typeof sessionToken !== "string") {
      logger.warn("[Increment API] Missing or invalid session token");
      return NextResponse.json(
        { error: "Session token is required" },
        { status: 400 }
      );
    }

    if (!isValidTokenFormat(sessionToken)) {
      logger.warn("[Increment API] Invalid session token format");
      return NextResponse.json(
        { error: "Invalid session token format" },
        { status: 400 }
      );
    }

    const tokenHash = hashTokenForLogging(sessionToken);
    logger.info(
      `[Increment API] Incrementing message count for token: ${tokenHash}`
    );

    // Use query builder instead of raw SQL to prevent injection
    const [session] = await db
      .select({
        id: anonymousSessions.id,
        message_count: anonymousSessions.message_count,
      })
      .from(anonymousSessions)
      .where(eq(anonymousSessions.session_token, sessionToken))
      .limit(1);

    if (!session) {
      logger.warn(`[Increment API] Session not found for token: ${tokenHash}`);
      return NextResponse.json(
        { error: "Session not found", code: "SESSION_NOT_FOUND" },
        { status: 404 }
      );
    }

    const previousCount = session.message_count;

    // Increment the message count (uses atomic update)
    const updatedSession = await anonymousSessionsService.incrementMessageCount(
      session.id
    );

    logger.info("[Increment API] Message count incremented:", {
      sessionId: session.id,
      previousCount,
      newCount: updatedSession.message_count,
    });

    return NextResponse.json(
      {
        success: true,
        previousCount,
        newCount: updatedSession.message_count,
        messagesRemaining:
          updatedSession.messages_limit - updatedSession.message_count,
      },
      {
        headers: {
          "X-RateLimit-Remaining": String(rateLimit.remaining),
        },
      }
    );
  } catch (error) {
    logger.error("[Increment API] Error incrementing message count:", error);
    return NextResponse.json(
      {
        error: "Failed to increment message count",
      },
      { status: 500 }
    );
  }
}

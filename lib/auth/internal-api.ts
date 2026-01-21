/**
 * Internal API Authentication
 *
 * Validates internal API key for service-to-service communication.
 * Uses constant-time comparison to prevent timing attacks.
 */

import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

// Log config issues once at startup, not on every request
if (!INTERNAL_API_KEY && process.env.NODE_ENV !== "test") {
  console.error(
    "[CRITICAL] INTERNAL_API_KEY not configured - internal API authentication will fail",
  );
}

/**
 * Validates that the request has a valid internal API key.
 * Uses constant-time comparison to prevent timing attacks.
 * Returns null if valid, or an error response if invalid.
 */
export function validateInternalApiKey(
  request: NextRequest,
): NextResponse | null {
  // Don't reveal whether the key is configured - always return 401 for auth failures
  if (!INTERNAL_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const providedKey = request.headers.get("X-Internal-API-Key");

  if (!providedKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Constant-time comparison to prevent timing attacks
  const expectedBuffer = Buffer.from(INTERNAL_API_KEY, "utf8");
  const providedBuffer = Buffer.from(providedKey, "utf8");

  // First check length (if different, comparison will fail anyway)
  // We still do the timingSafeEqual even if lengths differ to avoid
  // leaking information about whether length was the issue
  const lengthsMatch = expectedBuffer.length === providedBuffer.length;

  // If lengths differ, create equal-length buffers for comparison
  // This ensures constant-time behavior regardless of length mismatch
  const compareExpected = lengthsMatch
    ? expectedBuffer
    : Buffer.alloc(Math.max(expectedBuffer.length, providedBuffer.length));
  const compareProvided = lengthsMatch
    ? providedBuffer
    : Buffer.alloc(Math.max(expectedBuffer.length, providedBuffer.length));

  if (!lengthsMatch) {
    expectedBuffer.copy(compareExpected);
    providedBuffer.copy(compareProvided);
  }

  const keysMatch = timingSafeEqual(compareExpected, compareProvided);

  if (!lengthsMatch || !keysMatch) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

/**
 * Higher-order function to wrap handlers with internal API key validation.
 */
export function withInternalAuth<T>(
  handler: (request: NextRequest, ...args: unknown[]) => Promise<T>,
) {
  return async (
    request: NextRequest,
    ...args: unknown[]
  ): Promise<T | NextResponse> => {
    const authError = validateInternalApiKey(request);
    if (authError) return authError;
    return handler(request, ...args);
  };
}

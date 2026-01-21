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
  // Length check is not constant-time but leaking length is acceptable
  // (key length is not secret, key content is)
  const expectedBuffer = Buffer.from(INTERNAL_API_KEY, "utf8");
  const providedBuffer = Buffer.from(providedKey, "utf8");

  const keysMatch =
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer);

  if (!keysMatch) {
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

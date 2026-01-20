/**
 * Internal API Authentication
 *
 * Validates internal API key for service-to-service communication.
 */

import { NextRequest, NextResponse } from "next/server";

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

/**
 * Validates that the request has a valid internal API key.
 * Returns null if valid, or an error response if invalid.
 */
export function validateInternalApiKey(
  request: NextRequest,
): NextResponse | null {
  if (!INTERNAL_API_KEY) {
    return NextResponse.json(
      { error: "Internal API not configured" },
      { status: 503 },
    );
  }

  const providedKey = request.headers.get("X-Internal-API-Key");

  if (!providedKey || providedKey !== INTERNAL_API_KEY) {
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
  return async (request: NextRequest, ...args: unknown[]): Promise<T | NextResponse> => {
    const authError = validateInternalApiKey(request);
    if (authError) return authError;
    return handler(request, ...args);
  };
}

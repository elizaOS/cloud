/**
 * Shared error handler for compat routes.
 *
 * Maps well-known error messages to HTTP status codes. Uses
 * instanceof checks rather than brittle string matching where
 * possible; the string fallback handles errors thrown by
 * dependencies that don't export typed error classes.
 *
 * 500-level responses intentionally return a generic message to
 * avoid leaking internal details (e.g. missing env vars, DB
 * connection strings). The original error is logged server-side.
 */

import { NextResponse } from "next/server";
import { errorEnvelope } from "@/lib/api/compat-envelope";
import { ApiError, ForbiddenError, AuthenticationError } from "@/lib/api/errors";
import { ServiceKeyAuthError } from "@/lib/auth/service-key";
import { logger } from "@/lib/utils/logger";

export function handleCompatError(err: unknown): NextResponse {
  // 1. Typed API errors — use their built-in status / message.
  if (err instanceof ApiError) {
    return NextResponse.json(errorEnvelope(err.message), { status: err.status });
  }

  // 2. Service-key auth failures → 401.
  if (err instanceof ServiceKeyAuthError) {
    return NextResponse.json(errorEnvelope(err.message), { status: 401 });
  }

  // 3. Generic Error — heuristic status from message.
  if (err instanceof Error) {
    const msg = err.message;
    const isAuth = msg.includes("Unauthorized") || msg.includes("Invalid");
    const isForbid = msg.includes("Forbidden") || msg.includes("requires");

    if (isAuth) {
      return NextResponse.json(errorEnvelope(msg), { status: 401 });
    }
    if (isForbid) {
      return NextResponse.json(errorEnvelope(msg), { status: 403 });
    }

    // 500-level: log the real error, return a generic message.
    logger.error("[compat] Unhandled error", {
      error: msg,
      stack: err.stack,
    });
    return NextResponse.json(
      errorEnvelope("Internal server error"),
      { status: 500 },
    );
  }

  // 4. Non-Error throw — always generic.
  logger.error("[compat] Unhandled non-Error throw", { value: String(err) });
  return NextResponse.json(errorEnvelope("Internal server error"), { status: 500 });
}

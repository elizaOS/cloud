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
import { ApiError } from "@/lib/api/errors";
import { ServiceKeyAuthError } from "@/lib/auth/service-key";
import { applyCorsHeaders } from "@/lib/services/proxy/cors";
import { logger } from "@/lib/utils/logger";

function compatErrorResponse(message: string, status: number, methods: string): Response {
  return applyCorsHeaders(NextResponse.json(errorEnvelope(message), { status }), methods);
}

export function handleCompatError(err: unknown, methods = "GET, POST, DELETE, OPTIONS"): Response {
  // 1. Typed API errors — use their built-in status / message.
  if (err instanceof ApiError) {
    return compatErrorResponse(err.message, err.status, methods);
  }

  // 2. Service-key auth failures → 401.
  if (err instanceof ServiceKeyAuthError) {
    return compatErrorResponse(err.message, 401, methods);
  }

  // 3. Generic Error — heuristic status from message.
  //
  // The "Invalid" keyword was previously treated as a blanket 401 signal,
  // but many non-auth validation errors (e.g. "Invalid agent config",
  // "Invalid JSON body") also contain "Invalid". We now restrict the
  // heuristic to auth-specific phrases only.
  if (err instanceof Error) {
    const msg = err.message;
    const isAuth =
      msg.includes("Unauthorized") ||
      msg.includes("Invalid API key") ||
      msg.includes("Invalid token") ||
      msg.includes("Invalid credentials") ||
      msg.includes("Invalid service key");
    // "requires" was previously a blanket 403 signal, but many non-auth
    // errors also contain the word (e.g. "Table requires migration",
    // "Field requires a value"). Restrict to auth/access-specific phrases.
    const isForbid =
      msg.includes("Forbidden") ||
      msg.includes("requires authentication") ||
      msg.includes("requires authorization") ||
      msg.includes("requires admin") ||
      msg.includes("requires owner") ||
      msg.includes("requires org membership");

    if (isAuth) {
      return compatErrorResponse(msg, 401, methods);
    }
    if (isForbid) {
      return compatErrorResponse(msg, 403, methods);
    }

    // 500-level: log the real error, return a generic message.
    logger.error("[compat] Unhandled error", {
      error: msg,
      stack: err.stack,
    });
    return compatErrorResponse("Internal server error", 500, methods);
  }

  // 4. Non-Error throw — always generic.
  logger.error("[compat] Unhandled non-Error throw", { value: String(err) });
  return compatErrorResponse("Internal server error", 500, methods);
}

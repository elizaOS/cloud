/**
 * Shared error handler for compat routes.
 *
 * Maps well-known error messages to HTTP status codes. Uses
 * instanceof checks rather than brittle string matching where
 * possible; the string fallback handles errors thrown by
 * dependencies that don't export typed error classes.
 */

import { NextResponse } from "next/server";
import { errorEnvelope } from "@/lib/api/compat-envelope";
import { ForbiddenError } from "@/lib/api/errors";

export function handleCompatError(err: unknown): NextResponse {
  if (err instanceof ForbiddenError) {
    return NextResponse.json(errorEnvelope(err.message), { status: 403 });
  }

  if (err instanceof Error) {
    const msg = err.message;
    const status = msg.includes("Unauthorized") || msg.includes("Invalid")
      ? 401
      : msg.includes("Forbidden") || msg.includes("requires")
        ? 403
        : 500;
    return NextResponse.json(errorEnvelope(msg), { status });
  }

  return NextResponse.json(errorEnvelope("Internal server error"), { status: 500 });
}

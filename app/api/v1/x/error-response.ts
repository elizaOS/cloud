import { NextResponse } from "next/server";
import { nextJsonFromCaughtError } from "@/lib/api/errors";
import { XServiceError } from "@/lib/services/x";

type ErrorWithStatus = Error & { status: number };

function isXServiceError(error: unknown): error is ErrorWithStatus {
  return (
    error instanceof XServiceError ||
    (error instanceof Error &&
      error.name === "XServiceError" &&
      typeof (error as { status?: unknown }).status === "number")
  );
}

export function xRouteErrorResponse(error: unknown): NextResponse {
  if (isXServiceError(error)) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }

  return nextJsonFromCaughtError(error);
}

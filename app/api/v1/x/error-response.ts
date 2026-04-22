import { NextResponse } from "next/server";
import { nextJsonFromCaughtError } from "@/lib/api/errors";
import { XServiceError } from "@/lib/services/x";

type ErrorWithStatus = Error & { status: number };

function isHttpStatusError(error: unknown): error is ErrorWithStatus {
  if (!(error instanceof Error)) return false;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" && Number.isInteger(status) && status >= 400 && status < 600;
}

export function xRouteErrorResponse(error: unknown): NextResponse {
  if (error instanceof XServiceError || isHttpStatusError(error)) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }

  return nextJsonFromCaughtError(error);
}

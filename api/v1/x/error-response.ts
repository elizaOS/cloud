// `NextResponse` was previously imported from `next/server`, which pulls
// Node-only modules and breaks the Cloudflare Workers bundle. We use plain
// `Response` here — same shape for our purposes (JSON + status code).
import { nextJsonFromCaughtError } from "@/lib/api/errors";
import { XServiceError } from "@/lib/services/x";

type ErrorWithStatus = Error & { status: number };

function isHttpStatusError(error: unknown): error is ErrorWithStatus {
  if (!(error instanceof Error)) return false;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" && Number.isInteger(status) && status >= 400 && status < 600;
}

export function xRouteErrorResponse(error: unknown): Response {
  if (error instanceof XServiceError || isHttpStatusError(error)) {
    return Response.json({ success: false, error: error.message }, { status: error.status });
  }

  return nextJsonFromCaughtError(error);
}

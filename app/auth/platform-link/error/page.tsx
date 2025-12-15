"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { XCircle, Loader2, RefreshCw } from "lucide-react";

const ERROR_MESSAGES: Record<string, string> = {
  missing_params: "The authorization request was incomplete.",
  invalid_session: "This link is invalid or has expired.",
  exchange_failed: "Failed to complete authorization. Please try again.",
  access_denied: "Authorization was denied.",
  server_error: "A server error occurred. Please try again later.",
};

function ErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const platform = searchParams.get("platform");

  const errorMessage = error
    ? ERROR_MESSAGES[error] || decodeURIComponent(error)
    : "An unknown error occurred.";

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-6">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-500/20">
          <XCircle className="h-10 w-10 text-red-400" />
        </div>

        <h1 className="mb-3 text-2xl font-bold">Connection Failed</h1>

        <p className="mb-6 text-zinc-400">{errorMessage}</p>

        {platform && (
          <p className="mb-8 text-sm text-zinc-500">
            Platform: <span className="capitalize">{platform}</span>
          </p>
        )}

        <div className="flex flex-col gap-3">
          <button
            onClick={() => window.history.back()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 px-6 py-3 font-medium text-white hover:bg-purple-500"
          >
            <RefreshCw className="h-4 w-4" />
            Try Again
          </button>

          <button
            onClick={() => window.close()}
            className="w-full rounded-xl border border-zinc-700 px-6 py-3 font-medium text-white hover:bg-zinc-800"
          >
            Close Window
          </button>
        </div>

        <p className="mt-6 text-xs text-zinc-500">
          If this problem persists, please contact support.
        </p>
      </div>
    </div>
  );
}

export default function PlatformLinkErrorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-950">
          <Loader2 className="h-12 w-12 animate-spin text-purple-500" />
        </div>
      }
    >
      <ErrorContent />
    </Suspense>
  );
}

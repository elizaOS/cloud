"use client";

/**
 * Global Error Boundary for App Router
 *
 * This component catches errors that occur in the root layout or
 * errors that bubble up from child layouts.
 *
 * Note: global-error.tsx must define its own <html> and <body> tags
 * because the root layout is replaced when this error boundary renders.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="bg-black text-white">
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="w-full max-w-md space-y-6 text-center">
            <div className="space-y-2">
              <h1 className="text-2xl font-bold">Something went wrong</h1>
              <p className="text-gray-400">
                An unexpected error occurred. Our team has been notified.
              </p>
              {error.digest && (
                <p className="text-xs text-gray-500">Error ID: {error.digest}</p>
              )}
            </div>
            <div className="flex flex-col gap-3">
              <button
                onClick={reset}
                className="rounded-lg bg-white px-4 py-2 text-black transition-colors hover:bg-gray-200"
              >
                Try again
              </button>
              <a
                href="/"
                className="rounded-lg border border-gray-700 px-4 py-2 transition-colors hover:bg-gray-900"
              >
                Go to homepage
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}

/**
 * Shared placeholders + skeletons used across the converted dashboard pages.
 *
 * Most dashboard pages were originally Next.js Server Components that called
 * `requireAuth()` + a service-layer fetch and then rendered a `*PageClient`
 * with the data. In the SPA each page becomes a thin wrapper that:
 *
 *   1. Gates on `useRequireAuth()` — redirects to /login if needed.
 *   2. Calls the matching `useXxx()` query hook.
 *   3. While loading, renders `<DashboardLoadingState />`.
 *   4. On success, renders the existing `*PageClient`.
 *
 * Until every API endpoint exists, pages whose data hook is still stubbed
 * render `<DashboardEndpointPending />` so the route mounts without crashing.
 */
import { Loader2 } from "lucide-react";

export function DashboardLoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-12 text-sm text-neutral-400">
      <Loader2 className="h-5 w-5 animate-spin text-primary" />
      <p>{label}…</p>
    </div>
  );
}

export function DashboardEndpointPending({ endpoint, what }: { endpoint: string; what: string }) {
  return (
    <div className="mx-auto max-w-prose space-y-3 p-12 text-sm text-neutral-400">
      <h1 className="text-lg font-semibold text-white">{what}</h1>
      <p>
        The matching API endpoint <code className="text-orange-400">{endpoint}</code> is not yet
        converted to a Cloudflare Worker route. Once Agent G publishes it, the matching{" "}
        <code>useXxx()</code> hook in <code>frontend/src/lib/data/</code> will start returning real
        data and this page will render automatically.
      </p>
    </div>
  );
}

export function DashboardErrorState({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-prose space-y-3 p-12 text-sm text-red-300">
      <h1 className="text-lg font-semibold text-red-100">Something went wrong</h1>
      <p>{message}</p>
    </div>
  );
}

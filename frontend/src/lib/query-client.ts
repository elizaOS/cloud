import { QueryClient } from "@tanstack/react-query";

/**
 * Single QueryClient for the SPA. Defaults match the dashboard's read-mostly
 * pattern: 30s stale time, retry on transient errors only, refetch on window
 * focus disabled so navigation doesn't hammer the API.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error) => {
        // Don't retry 4xx — they won't get better.
        const status = (error as { status?: number })?.status;
        if (typeof status === "number" && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});

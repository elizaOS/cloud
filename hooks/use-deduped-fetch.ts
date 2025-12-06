/**
 * useDedupedFetch - Deduplicated Data Fetching Hook
 *
 * This hook prevents duplicate API calls by:
 * 1. Deduplicating concurrent requests to the same endpoint
 * 2. Caching responses for a configurable TTL
 * 3. Providing stale-while-revalidate behavior
 * 4. Tracking in-flight requests to prevent race conditions
 *
 * Usage:
 *   const { data, error, isLoading, refetch } = useDedupedFetch<MyType>(
 *     '/api/my-endpoint',
 *     { revalidateOnFocus: true, dedupingInterval: 2000 }
 *   );
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// Global request cache and in-flight tracking
const requestCache = new Map<
  string,
  { data: unknown; timestamp: number; expiresAt: number }
>();
const inFlightRequests = new Map<string, Promise<Response>>();

// Default configuration
const DEFAULT_DEDUPING_INTERVAL = 2000; // 2 seconds
const DEFAULT_CACHE_TTL = 30000; // 30 seconds
const DEFAULT_STALE_TTL = 60000; // 60 seconds (serve stale while revalidating)

interface UseDedupedFetchOptions {
  /** How long to dedupe identical requests (ms) */
  dedupingInterval?: number;
  /** How long to cache fresh data (ms) */
  cacheTTL?: number;
  /** How long stale data can be served while revalidating (ms) */
  staleTTL?: number;
  /** Revalidate when window regains focus */
  revalidateOnFocus?: boolean;
  /** Revalidate when network reconnects */
  revalidateOnReconnect?: boolean;
  /** Skip the initial fetch (for conditional fetching) */
  skip?: boolean;
  /** Fetch options (headers, method, body, etc.) */
  fetchOptions?: RequestInit;
  /** Transform the response before caching */
  transform?: <T>(data: T) => T;
}

interface UseDedupedFetchResult<T> {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
  isValidating: boolean;
  refetch: () => Promise<void>;
  mutate: (data: T | ((prev: T | null) => T)) => void;
}

/**
 * Generate a cache key for a request
 */
function getCacheKey(url: string, options?: RequestInit): string {
  const method = options?.method || "GET";
  const body = options?.body ? String(options.body) : "";
  return `${method}:${url}:${body}`;
}

/**
 * Deduplicated fetch hook
 */
export function useDedupedFetch<T>(
  url: string | null,
  options: UseDedupedFetchOptions = {},
): UseDedupedFetchResult<T> {
  const {
    dedupingInterval = DEFAULT_DEDUPING_INTERVAL,
    cacheTTL = DEFAULT_CACHE_TTL,
    staleTTL = DEFAULT_STALE_TTL,
    revalidateOnFocus = false,
    revalidateOnReconnect = false,
    skip = false,
    fetchOptions,
    transform,
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(!skip && !!url);
  const [isValidating, setIsValidating] = useState(false);

  // Use refs to avoid stale closures
  const mountedRef = useRef(true);
  const lastFetchRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Memoize the cache key
  const cacheKey = useMemo(
    () => (url ? getCacheKey(url, fetchOptions) : null),
    [url, fetchOptions],
  );

  // Fetch function
  const fetchData = useCallback(
    async (forceRevalidate = false) => {
      if (!url || !cacheKey || skip) return;

      const now = Date.now();

      // Check if we should dedupe this request
      if (!forceRevalidate && now - lastFetchRef.current < dedupingInterval) {
        console.debug(`[useDedupedFetch] Deduping request to ${url}`);
        return;
      }

      // Check cache
      const cached = requestCache.get(cacheKey);
      if (cached) {
        const isFresh = now < cached.expiresAt;
        const isStale = now < cached.timestamp + staleTTL;

        if (isFresh && !forceRevalidate) {
          // Cache hit - return cached data
          setData(cached.data as T);
          setIsLoading(false);
          setError(null);
          return;
        }

        if (isStale && !forceRevalidate) {
          // Stale-while-revalidate - return stale data but revalidate in background
          setData(cached.data as T);
          setIsLoading(false);
          setIsValidating(true);
        }
      }

      // Check for in-flight request (deduplication)
      const inFlight = inFlightRequests.get(cacheKey);
      if (inFlight && !forceRevalidate) {
        console.debug(`[useDedupedFetch] Joining in-flight request to ${url}`);
        try {
          const response = await inFlight;
          const responseData = await response.clone().json();
          const transformedData = transform
            ? transform(responseData)
            : responseData;

          if (mountedRef.current) {
            setData(transformedData as T);
            setIsLoading(false);
            setIsValidating(false);
            setError(null);
          }
        } catch (err) {
          if (mountedRef.current) {
            setError(err instanceof Error ? err : new Error(String(err)));
            setIsLoading(false);
            setIsValidating(false);
          }
        }
        return;
      }

      // Cancel any previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // Track this request
      lastFetchRef.current = now;

      if (!data) {
        setIsLoading(true);
      }
      setIsValidating(true);

      try {
        // Create the fetch promise and store it for deduplication
        const fetchPromise = fetch(url, {
          ...fetchOptions,
          signal: abortController.signal,
        });

        inFlightRequests.set(cacheKey, fetchPromise);

        const response = await fetchPromise;

        // Remove from in-flight after response received
        inFlightRequests.delete(cacheKey);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const responseData = await response.json();
        const transformedData = transform
          ? transform(responseData)
          : responseData;

        // Update cache
        requestCache.set(cacheKey, {
          data: transformedData,
          timestamp: now,
          expiresAt: now + cacheTTL,
        });

        if (mountedRef.current) {
          setData(transformedData as T);
          setError(null);
          setIsLoading(false);
          setIsValidating(false);
        }
      } catch (err) {
        // Remove from in-flight on error
        inFlightRequests.delete(cacheKey);

        if (err instanceof Error && err.name === "AbortError") {
          // Request was cancelled - ignore
          return;
        }

        if (mountedRef.current) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsLoading(false);
          setIsValidating(false);
        }
      }
    },
    [
      url,
      cacheKey,
      skip,
      dedupingInterval,
      cacheTTL,
      staleTTL,
      fetchOptions,
      transform,
      data,
    ],
  );

  // Refetch function (forces revalidation)
  const refetch = useCallback(async () => {
    await fetchData(true);
  }, [fetchData]);

  // Mutate function (optimistic updates)
  const mutate = useCallback(
    (newData: T | ((prev: T | null) => T)) => {
      const resolvedData =
        typeof newData === "function"
          ? (newData as (prev: T | null) => T)(data)
          : newData;

      setData(resolvedData);

      // Update cache
      if (cacheKey) {
        const now = Date.now();
        requestCache.set(cacheKey, {
          data: resolvedData,
          timestamp: now,
          expiresAt: now + cacheTTL,
        });
      }
    },
    [data, cacheKey, cacheTTL],
  );

  // Initial fetch
  useEffect(() => {
    fetchData();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchData]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Revalidate on focus
  useEffect(() => {
    if (!revalidateOnFocus) return;

    const handleFocus = () => {
      fetchData();
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [revalidateOnFocus, fetchData]);

  // Revalidate on reconnect
  useEffect(() => {
    if (!revalidateOnReconnect) return;

    const handleOnline = () => {
      fetchData(true);
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [revalidateOnReconnect, fetchData]);

  return {
    data,
    error,
    isLoading,
    isValidating,
    refetch,
    mutate,
  };
}

/**
 * Clear the entire request cache
 */
export function clearFetchCache(): void {
  requestCache.clear();
}

/**
 * Invalidate a specific cache key
 */
export function invalidateFetchCache(url: string, options?: RequestInit): void {
  const cacheKey = getCacheKey(url, options);
  requestCache.delete(cacheKey);
}

/**
 * Prefetch a URL and cache the result
 */
export async function prefetch<T>(
  url: string,
  options?: RequestInit,
  cacheTTL = DEFAULT_CACHE_TTL,
): Promise<T> {
  const cacheKey = getCacheKey(url, options);

  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  const now = Date.now();

  requestCache.set(cacheKey, {
    data,
    timestamp: now,
    expiresAt: now + cacheTTL,
  });

  return data as T;
}

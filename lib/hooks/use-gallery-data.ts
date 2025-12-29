/**
 * Gallery data hook with request deduplication.
 *
 * Prevents multiple components from making duplicate gallery data requests
 * by using module-level caching and in-flight request tracking.
 *
 * @example
 * ```ts
 * const { items, stats, collections, isLoading, refetch } = useGalleryData({
 *   type: 'image',
 *   source: 'all',
 * });
 * ```
 */

"use client";

import { useState, useEffect, useRef, useCallback, startTransition } from "react";
import {
  listUserMedia,
  getUserMediaStats,
  listCollections,
} from "@/app/actions/gallery";
import type { GalleryItem, CollectionSummary } from "@/app/actions/gallery";

// Cache TTL
const CACHE_TTL = 10000; // 10 seconds for gallery data

// Module-level cache
interface GalleryCache {
  items: { data: GalleryItem[]; timestamp: number; key: string } | null;
  stats: {
    data: Awaited<ReturnType<typeof getUserMediaStats>>;
    timestamp: number;
  } | null;
  collections: { data: CollectionSummary[]; timestamp: number } | null;
}

const cache: GalleryCache = {
  items: null,
  stats: null,
  collections: null,
};

// In-flight request tracking
// Note: items uses a Map keyed by cache key to support different filter combinations
const inFlightRequests: {
  items: Map<string, Promise<GalleryItem[]>>;
  stats: Promise<Awaited<ReturnType<typeof getUserMediaStats>>> | null;
  collections: Promise<CollectionSummary[]> | null;
} = {
  items: new Map(),
  stats: null,
  collections: null,
};

interface UseGalleryDataOptions {
  type?: "image" | "video" | "audio" | "all";
  source?: "generation" | "upload" | "all";
  limit?: number;
  /** Skip fetching items (useful for collections-only view) */
  skipItems?: boolean;
  /** Skip fetching stats */
  skipStats?: boolean;
  /** Skip fetching collections */
  skipCollections?: boolean;
}

interface UseGalleryDataResult {
  items: GalleryItem[];
  stats: {
    totalImages: number;
    totalVideos: number;
    totalUploads: number;
    totalSize: number;
  } | null;
  collections: CollectionSummary[];
  isLoading: boolean;
  isLoadingItems: boolean;
  isLoadingStats: boolean;
  isLoadingCollections: boolean;
  refetch: () => Promise<void>;
  refetchItems: () => Promise<void>;
  refetchStats: () => Promise<void>;
  refetchCollections: () => Promise<void>;
}

function getCacheKey(options: UseGalleryDataOptions): string {
  return `${options.type || "all"}-${options.source || "all"}-${options.limit || 100}`;
}

/**
 * Fetches gallery items with deduplication.
 * Uses cache-key-aware in-flight tracking to prevent returning wrong data when filters change.
 */
async function fetchItems(
  options: UseGalleryDataOptions,
  force = false,
): Promise<GalleryItem[]> {
  const cacheKey = getCacheKey(options);
  const now = Date.now();

  // Check cache
  if (
    !force &&
    cache.items &&
    cache.items.key === cacheKey &&
    now - cache.items.timestamp < CACHE_TTL
  ) {
    return cache.items.data;
  }

  // Join in-flight request if exists for the same cache key
  const existingRequest = inFlightRequests.items.get(cacheKey);
  if (existingRequest) {
    return existingRequest;
  }

  // Start new request
  const requestPromise = (async () => {
    try {
      const fetchOptions: Parameters<typeof listUserMedia>[0] = {
        limit: options.limit || 100,
      };
      if (options.type && options.type !== "all") {
        fetchOptions.type = options.type;
      }
      if (options.source && options.source !== "all") {
        fetchOptions.source = options.source;
      }

      const data = await listUserMedia(fetchOptions);
      cache.items = { data, timestamp: Date.now(), key: cacheKey };
      return data;
    } finally {
      inFlightRequests.items.delete(cacheKey);
    }
  })();

  inFlightRequests.items.set(cacheKey, requestPromise);
  return requestPromise;
}

/**
 * Fetches gallery stats with deduplication.
 */
async function fetchStats(
  force = false,
): Promise<Awaited<ReturnType<typeof getUserMediaStats>>> {
  const now = Date.now();

  // Check cache
  if (!force && cache.stats && now - cache.stats.timestamp < CACHE_TTL) {
    return cache.stats.data;
  }

  // Join in-flight request if exists
  if (inFlightRequests.stats) {
    return inFlightRequests.stats;
  }

  // Start new request
  inFlightRequests.stats = (async () => {
    try {
      const data = await getUserMediaStats();
      cache.stats = { data, timestamp: Date.now() };
      return data;
    } finally {
      inFlightRequests.stats = null;
    }
  })();

  return inFlightRequests.stats;
}

/**
 * Fetches collections with deduplication.
 */
async function fetchCollections(force = false): Promise<CollectionSummary[]> {
  const now = Date.now();

  // Check cache
  if (
    !force &&
    cache.collections &&
    now - cache.collections.timestamp < CACHE_TTL
  ) {
    return cache.collections.data;
  }

  // Join in-flight request if exists
  if (inFlightRequests.collections) {
    return inFlightRequests.collections;
  }

  // Start new request
  inFlightRequests.collections = (async () => {
    try {
      const data = await listCollections();
      cache.collections = { data, timestamp: Date.now() };
      return data;
    } finally {
      inFlightRequests.collections = null;
    }
  })();

  return inFlightRequests.collections;
}

/**
 * Hook to fetch gallery data with automatic deduplication.
 */
export function useGalleryData(
  options: UseGalleryDataOptions = {},
): UseGalleryDataResult {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [stats, setStats] = useState<UseGalleryDataResult["stats"]>(null);
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(!options.skipItems);
  const [isLoadingStats, setIsLoadingStats] = useState(!options.skipStats);
  const [isLoadingCollections, setIsLoadingCollections] = useState(
    !options.skipCollections,
  );

  const mountedRef = useRef(true);
  const optionsRef = useRef(options);

  // Update ref in effect to avoid updating during render
  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Fetch items when options change
  useEffect(() => {
    const { type, source, limit, skipItems } = options;
    if (skipItems) {
      return;
    }

    let cancelled = false;
    
    // Use startTransition to avoid synchronous setState warning
    startTransition(() => {
      setIsLoadingItems(true);
    });

    // Construct fetch options from dependencies to satisfy exhaustive-deps
    const fetchOpts = { type, source, limit };
    fetchItems(fetchOpts).then((data) => {
      if (!cancelled && mountedRef.current) {
        setItems(data);
        setIsLoadingItems(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [options]);

  // Fetch stats on mount
  useEffect(() => {
    if (options.skipStats) {
      return;
    }

    let cancelled = false;
    
    startTransition(() => {
      setIsLoadingStats(true);
    });

    fetchStats().then((data) => {
      if (!cancelled && mountedRef.current) {
        setStats(data);
        setIsLoadingStats(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [options.skipStats]);

  // Fetch collections on mount
  useEffect(() => {
    if (options.skipCollections) {
      return;
    }

    let cancelled = false;
    
    startTransition(() => {
      setIsLoadingCollections(true);
    });

    fetchCollections().then((data) => {
      if (!cancelled && mountedRef.current) {
        setCollections(data);
        setIsLoadingCollections(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [options.skipCollections]);

  const refetchItems = useCallback(async () => {
    if (optionsRef.current.skipItems) return;
    setIsLoadingItems(true);
    const data = await fetchItems(optionsRef.current, true);
    if (mountedRef.current) {
      setItems(data);
      setIsLoadingItems(false);
    }
  }, []);

  const refetchStats = useCallback(async () => {
    if (optionsRef.current.skipStats) return;
    setIsLoadingStats(true);
    const data = await fetchStats(true);
    if (mountedRef.current) {
      setStats(data);
      setIsLoadingStats(false);
    }
  }, []);

  const refetchCollections = useCallback(async () => {
    if (optionsRef.current.skipCollections) return;
    setIsLoadingCollections(true);
    const data = await fetchCollections(true);
    if (mountedRef.current) {
      setCollections(data);
      setIsLoadingCollections(false);
    }
  }, []);

  const refetch = useCallback(async () => {
    await Promise.all([refetchItems(), refetchStats(), refetchCollections()]);
  }, [refetchItems, refetchStats, refetchCollections]);

  return {
    items,
    stats,
    collections,
    isLoading: isLoadingItems || isLoadingStats || isLoadingCollections,
    isLoadingItems,
    isLoadingStats,
    isLoadingCollections,
    refetch,
    refetchItems,
    refetchStats,
    refetchCollections,
  };
}

/**
 * Clears all gallery caches.
 */
export function clearGalleryCache(): void {
  cache.items = null;
  cache.stats = null;
  cache.collections = null;
  inFlightRequests.items.clear();
}

/**
 * Invalidates the items cache (useful after upload/delete).
 */
export function invalidateGalleryItems(): void {
  cache.items = null;
  inFlightRequests.items.clear();
}

/**
 * Invalidates the collections cache.
 */
export function invalidateGalleryCollections(): void {
  cache.collections = null;
}

"use client";

/**
 * @deprecated Use `useCredits` from `@/providers/CreditsProvider` instead.
 *
 * This hook creates its own polling instance which causes duplicate API calls
 * when used in multiple components. The CreditsProvider centralizes credit
 * fetching to a single location, reducing API load by ~75%.
 *
 * Before (2 components using this hook = 2 polling intervals):
 *   import { useCreditsStream } from "@/hooks/use-credits-stream";
 *   const { creditBalance } = useCreditsStream();
 *
 * After (centralized polling):
 *   import { useCredits } from "@/providers/CreditsProvider";
 *   const { creditBalance } = useCredits();
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { usePrivy } from "@/lib/providers/PrivyProvider";

/**
 * Return value from useCreditsStream hook.
 */
interface UseCreditsStreamResult {
  /** Current credit balance or null if not loaded. */
  creditBalance: number | null;
  /** Whether the connection is active. */
  isConnected: boolean;
  /** Whether the initial balance fetch is in progress. */
  isLoading: boolean;
  /** Error message if fetch failed. */
  error: string | null;
  /** Timestamp of last successful balance update. */
  lastUpdate: Date | null;
  /** Function to manually refresh the balance. */
  refreshBalance: () => Promise<void>;
}

const POLL_INTERVAL = 10000;
const MAX_AUTH_ERRORS = 3; // Stop polling after 3 consecutive auth errors

/**
 * @deprecated Use `useCredits` from `@/providers/CreditsProvider` instead.
 */
export function useCreditsStream(): UseCreditsStreamResult {
  const { authenticated, ready } = usePrivy();
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isConnected, setIsConnected] = useState(true);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const authErrorCountRef = useRef(0);
  const isPollingPausedRef = useRef(false);

  // Stop polling when too many auth errors occur
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    isPollingPausedRef.current = true;
  }, []);

  // Resume polling (e.g., when user re-authenticates)
  const resumePolling = useCallback(() => {
    authErrorCountRef.current = 0;
    isPollingPausedRef.current = false;
  }, []);

  const fetchBalance = useCallback(async () => {
    if (!isMountedRef.current) return;

    // Don't fetch if not authenticated or polling is paused
    if (!authenticated || isPollingPausedRef.current) {
      if (isMountedRef.current) {
        setIsLoading(false);
        // Clear balance for unauthenticated users
        if (!authenticated) {
          setCreditBalance(null);
          setError(null);
        }
      }
      return;
    }

    try {
      const response = await fetch("/api/credits/balance", {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        },
      });

      if (!response.ok) {
        // Handle 401 Unauthorized specifically
        if (response.status === 401) {
          authErrorCountRef.current++;

          // Log only on first error to avoid console spam
          if (authErrorCountRef.current === 1) {
            console.warn(
              "[useCreditsStream] Unauthorized - user may need to re-authenticate",
            );
          }

          // Stop polling after too many auth errors
          if (authErrorCountRef.current >= MAX_AUTH_ERRORS) {
            console.warn(
              "[useCreditsStream] Too many auth errors, pausing polling",
            );
            stopPolling();
          }

          if (isMountedRef.current) {
            setError("Unauthorized");
            setIsConnected(false);
            setCreditBalance(null);
          }
          return;
        }

        throw new Error(`Failed to fetch balance: ${response.statusText}`);
      }

      // Reset auth error count on success
      authErrorCountRef.current = 0;

      const data = await response.json();
      const balance = Number(data.balance);

      if (isMountedRef.current) {
        setCreditBalance(balance);
        setLastUpdate(new Date());
        setIsConnected(true);
        setError(null);

        broadcastChannelRef.current?.postMessage({
          type: "credit-update",
          balance,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch balance",
        );
        setIsConnected(false);
        console.error("[useCreditsStream] Error fetching balance:", err);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [authenticated, stopPolling]);

  // Setup BroadcastChannel for cross-tab sync
  useEffect(() => {
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      broadcastChannelRef.current = new BroadcastChannel("credits-sync");

      broadcastChannelRef.current.onmessage = (event) => {
        if (event.data.type === "credit-update" && isMountedRef.current) {
          setCreditBalance(event.data.balance);
          setLastUpdate(new Date(event.data.timestamp));
        }
      };

      return () => {
        broadcastChannelRef.current?.close();
      };
    }
  }, []);

  // Reset and resume polling when authentication state changes
  useEffect(() => {
    if (ready && authenticated) {
      resumePolling();
    }
  }, [ready, authenticated, resumePolling]);

  // Main polling effect
  useEffect(() => {
    isMountedRef.current = true;

    // Only start polling if authenticated and ready
    if (ready && authenticated && !isPollingPausedRef.current) {
      // Defer initial fetch to avoid cascading renders
      queueMicrotask(() => {
        fetchBalance();
      });

      pollIntervalRef.current = setInterval(() => {
        fetchBalance();
      }, POLL_INTERVAL);
    } else if (ready && !authenticated) {
      // User is not authenticated, set loading to false
      // Use queueMicrotask to defer execution and avoid synchronous setState
      queueMicrotask(() => {
        setIsLoading(false);
        setCreditBalance(null);
      });
    }

    return () => {
      isMountedRef.current = false;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [ready, authenticated, fetchBalance]);

  return {
    creditBalance,
    isConnected,
    isLoading,
    error,
    lastUpdate,
    refreshBalance: fetchBalance,
  };
}

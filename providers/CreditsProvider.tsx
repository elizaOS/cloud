"use client";

/**
 * Credits Provider - Centralized credit balance management
 *
 * Solves the duplicate polling problem by providing a single source of truth
 * for credit balance across all components that need it.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { usePrivy } from "@privy-io/react-auth";

interface CreditsContextValue {
  creditBalance: number | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  lastUpdate: Date | null;
  refreshBalance: () => Promise<void>;
}

const CreditsContext = createContext<CreditsContextValue | null>(null);

const POLL_INTERVAL = 30000; // Increased from 10s to 30s
const MAX_AUTH_ERRORS = 3;

export function CreditsProvider({ children }: { children: ReactNode }) {
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
  const isVisibleRef = useRef(true);
  const lastFetchTimeRef = useRef<number>(0);

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

    // Don't fetch if not authenticated, polling is paused, or tab is hidden
    if (!authenticated || isPollingPausedRef.current || !isVisibleRef.current) {
      if (isMountedRef.current) {
        setIsLoading(false);
        if (!authenticated) {
          setCreditBalance(null);
          setError(null);
        }
      }
      return;
    }

    // Debounce: don't fetch more than once per 5 seconds
    const now = Date.now();
    if (now - lastFetchTimeRef.current < 5000) {
      return;
    }
    lastFetchTimeRef.current = now;

    try {
      const response = await fetch("/api/credits/balance", {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          authErrorCountRef.current++;

          if (authErrorCountRef.current === 1) {
            console.warn(
              "[CreditsProvider] Unauthorized - user may need to re-authenticate"
            );
          }

          if (authErrorCountRef.current >= MAX_AUTH_ERRORS) {
            console.warn(
              "[CreditsProvider] Too many auth errors, pausing polling"
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
          err instanceof Error ? err.message : "Failed to fetch balance"
        );
        setIsConnected(false);
        console.error("[CreditsProvider] Error fetching balance:", err);
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

  // Visibility change handler - pause polling when tab is hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      isVisibleRef.current = document.visibilityState === "visible";

      // Fetch immediately when tab becomes visible (if enough time has passed)
      if (isVisibleRef.current && authenticated && ready) {
        fetchBalance();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [authenticated, ready, fetchBalance]);

  // Reset and resume polling when authentication state changes
  useEffect(() => {
    if (ready && authenticated) {
      resumePolling();
    }
  }, [ready, authenticated, resumePolling]);

  // Main polling effect
  useEffect(() => {
    isMountedRef.current = true;

    if (ready && authenticated && !isPollingPausedRef.current) {
      fetchBalance();

      pollIntervalRef.current = setInterval(() => {
        if (isVisibleRef.current) {
          fetchBalance();
        }
      }, POLL_INTERVAL);
    } else if (ready && !authenticated) {
      setIsLoading(false);
      setCreditBalance(null);
    }

    return () => {
      isMountedRef.current = false;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [ready, authenticated, fetchBalance]);

  const value: CreditsContextValue = {
    creditBalance,
    isConnected,
    isLoading,
    error,
    lastUpdate,
    refreshBalance: fetchBalance,
  };

  return (
    <CreditsContext.Provider value={value}>{children}</CreditsContext.Provider>
  );
}

/**
 * Hook to consume credits context
 * Falls back gracefully when used outside provider
 */
export function useCredits(): CreditsContextValue {
  const context = useContext(CreditsContext);

  if (!context) {
    // Return a sensible default when used outside provider
    // This allows gradual migration
    return {
      creditBalance: null,
      isConnected: false,
      isLoading: true,
      error: null,
      lastUpdate: null,
      refreshBalance: async () => {},
    };
  }

  return context;
}


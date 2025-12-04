"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";

interface UseCreditsStreamResult {
  creditBalance: number | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  lastUpdate: Date | null;
  refreshBalance: () => Promise<void>;
}

const POLL_INTERVAL = 10000;
const MAX_AUTH_ERRORS = 2; // Try to refresh token after 2 consecutive auth errors

export function useCreditsStream(): UseCreditsStreamResult {
  const { authenticated, ready, getAccessToken } = usePrivy();
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isConnected, setIsConnected] = useState(true);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const authErrorCountRef = useRef(0);
  const isRefreshingTokenRef = useRef(false);

  // Attempt to refresh the Privy token
  const refreshToken = useCallback(async (): Promise<boolean> => {
    if (isRefreshingTokenRef.current) return false;
    
    isRefreshingTokenRef.current = true;
    try {
      // getAccessToken() will automatically refresh the token if expired
      const token = await getAccessToken();
      isRefreshingTokenRef.current = false;
      
      if (token) {
        console.log("[useCreditsStream] Token refreshed successfully");
        authErrorCountRef.current = 0;
        return true;
      }
      return false;
    } catch (err) {
      console.warn("[useCreditsStream] Failed to refresh token:", err);
      isRefreshingTokenRef.current = false;
      return false;
    }
  }, [getAccessToken]);

  const fetchBalance = useCallback(async (isRetry = false) => {
    if (!isMountedRef.current) return;
    
    // Don't fetch if not authenticated
    if (!authenticated) {
      if (isMountedRef.current) {
        setIsLoading(false);
        setCreditBalance(null);
        setError(null);
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
          
          // On first 401, try to refresh the token silently
          if (authErrorCountRef.current === 1 && !isRetry) {
            console.log("[useCreditsStream] Got 401, attempting token refresh...");
            const refreshed = await refreshToken();
            if (refreshed) {
              // Retry the fetch with the new token
              return fetchBalance(true);
            }
          }
          
          // After max errors or failed refresh, just wait for next poll
          if (authErrorCountRef.current >= MAX_AUTH_ERRORS) {
            // Don't spam logs, just silently wait
            if (isMountedRef.current) {
              setError("Session expired");
              setIsConnected(false);
            }
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
  }, [authenticated, refreshToken]);

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

  // Reset error count when authentication state changes
  useEffect(() => {
    if (ready && authenticated) {
      authErrorCountRef.current = 0;
      setError(null);
    }
  }, [ready, authenticated]);

  // Main polling effect
  useEffect(() => {
    isMountedRef.current = true;

    // Only start polling if authenticated and ready
    if (ready && authenticated) {
      fetchBalance();

      pollIntervalRef.current = setInterval(() => {
        fetchBalance();
      }, POLL_INTERVAL);
    } else if (ready && !authenticated) {
      // User is not authenticated, set loading to false
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

  return {
    creditBalance,
    isConnected,
    isLoading,
    error,
    lastUpdate,
    refreshBalance: () => fetchBalance(),
  };
}

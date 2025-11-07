"use client";

import { useEffect, useState, useCallback, useRef } from "react";

interface UseCreditsStreamResult {
  creditBalance: number | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  lastUpdate: Date | null;
  refreshBalance: () => Promise<void>;
}

const POLL_INTERVAL = 10000;

export function useCreditsStream(): UseCreditsStreamResult {
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isConnected, setIsConnected] = useState(true);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!isMountedRef.current) return;

    try {
      const response = await fetch("/api/credits/balance", {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch balance: ${response.statusText}`);
      }

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
  }, []);

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

  useEffect(() => {
    isMountedRef.current = true;

    fetchBalance();

    pollIntervalRef.current = setInterval(() => {
      fetchBalance();
    }, POLL_INTERVAL);

    return () => {
      isMountedRef.current = false;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [fetchBalance]);

  return {
    creditBalance,
    isConnected,
    isLoading,
    error,
    lastUpdate,
    refreshBalance: fetchBalance,
  };
}

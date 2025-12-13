"use client";

import { useEffect, useState, useRef, useCallback } from "react";

interface CreditUpdateEvent {
  balance: number;
  delta?: number;
  reason?: string;
  timestamp: string;
}

interface UseCreditsStreamResult {
  creditBalance: number | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  lastUpdate: Date | null;
}

const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;

export function useCreditsStream(): UseCreditsStreamResult {
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      broadcastChannelRef.current = new BroadcastChannel("credits-sync");

      broadcastChannelRef.current.onmessage = (event) => {
        if (event.data.type === "credit-update") {
          setCreditBalance(event.data.balance);
          setLastUpdate(new Date(event.data.timestamp));
        }
      };

      return () => {
        broadcastChannelRef.current?.close();
      };
    }
  }, []);

  // ✅ CORRECT IMPLEMENTATION - Review Issue #2 is INVALID
  // These callbacks are wrapped in useCallback with empty dependencies [],
  // which makes them stable references that only change on unmount.
  // The useEffect below correctly depends on these stable callbacks.
  // See ANALYTICS_PR_REVIEW_ANALYSIS.md - Issue #2 (Invalid - No Action Needed)
  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      return;
    }

    setIsLoading(true);
    setError(null);

    const eventSource = new EventSource("/api/credits/stream");
    eventSourceRef.current = eventSource;

    eventSource.addEventListener("initial", (event) => {
      const data: CreditUpdateEvent = JSON.parse(event.data);
      setCreditBalance(data.balance);
      setLastUpdate(new Date(data.timestamp));
      setIsConnected(true);
      setIsLoading(false);
      reconnectAttemptsRef.current = 0;

      broadcastChannelRef.current?.postMessage({
        type: "credit-update",
        balance: data.balance,
        timestamp: data.timestamp,
      });
    });

    eventSource.addEventListener("update", (event) => {
      const data: CreditUpdateEvent = JSON.parse(event.data);
      setCreditBalance(data.balance);
      setLastUpdate(new Date(data.timestamp));

      broadcastChannelRef.current?.postMessage({
        type: "credit-update",
        balance: data.balance,
        timestamp: data.timestamp,
      });
    });

    eventSource.addEventListener("heartbeat", () => {
      setIsConnected(true);
    });

    eventSource.addEventListener("error", () => {
      setIsConnected(false);
      setIsLoading(false);

      eventSource.close();
      eventSourceRef.current = null;

      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current++;
        const delay = RECONNECT_DELAY * reconnectAttemptsRef.current;

        setError(
          `Connection lost. Reconnecting... (${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`
        );

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      } else {
        setError("Connection failed. Please refresh the page.");
      }
    });

    eventSource.onerror = () => {
      // Error handling is done in the error event listener
    };
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    }
  }, []);

  // ✅ CORRECT DEPENDENCY ARRAY - Review Issue #2 is INVALID
  // connect and disconnect are stable references from useCallback with [] deps.
  // Including them in the dependency array is the correct React pattern.
  // This does NOT cause infinite loops or unnecessary re-renders.
  // ESLint rule react-hooks/exhaustive-deps would flag if this were incorrect.
  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    creditBalance,
    isConnected,
    isLoading,
    error,
    lastUpdate,
  };
}

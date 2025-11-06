"use client";

import { useEffect, useState, useRef, useCallback } from "react";

export interface StreamMessage {
  id: string;
  entityId: string;
  agentId: string;
  content: {
    text: string;
    thought?: string;
    source?: string;
    inReplyTo?: string;
  };
  createdAt: number;
  isAgent: boolean;
  type: "user" | "agent" | "thinking" | "error";
}

interface UseMessageStreamResult {
  isConnected: boolean;
  error: string | null;
  reconnectAttempts: number;
}

const RECONNECT_DELAY = 2000;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_BACKOFF_MULTIPLIER = 1.5;
const MAX_RECONNECT_DELAY = 30000; // 30 seconds

export function useMessageStream(
  roomId: string | null,
  onMessage: (message: StreamMessage) => void,
  onConnected?: (data: { roomId: string; timestamp: string }) => void,
  onHeartbeat?: () => void,
): UseMessageStreamResult {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isUnmountedRef = useRef(false);
  const currentRoomIdRef = useRef<string | null>(null);

  const connect = useCallback(() => {
    // Don't connect if unmounted or no roomId or already connected to this room
    if (
      isUnmountedRef.current ||
      !roomId ||
      (eventSourceRef.current && currentRoomIdRef.current === roomId)
    ) {
      return;
    }

    // If we're switching rooms, close the old connection first
    if (
      eventSourceRef.current &&
      currentRoomIdRef.current &&
      currentRoomIdRef.current !== roomId
    ) {
      console.log("[Message SSE] Switching rooms, closing old connection");
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    currentRoomIdRef.current = roomId;
    console.log(`[Message SSE] Connecting to room: ${roomId}`);

    const eventSource = new EventSource(`/api/eliza/rooms/${roomId}/stream`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      if (isUnmountedRef.current) return;
      console.log("[Message SSE] ⚡ Connection opened");
      setIsConnected(true);
      setError(null);
      setReconnectAttempts(0);
    };

    eventSource.addEventListener("connected", (event) => {
      if (isUnmountedRef.current) return;
      try {
        const data = JSON.parse(event.data);
        console.log("[Message SSE] ✅ Connected to room:", data.roomId);
        onConnected?.(data);
      } catch (err) {
        console.error("[Message SSE] Error parsing connected event:", err);
      }
    });

    eventSource.addEventListener("message", (event) => {
      if (isUnmountedRef.current) return;
      try {
        const messageData: StreamMessage = JSON.parse(event.data);
        console.log("[Message SSE] 📨 Message received:", {
          id: messageData.id.substring(0, 8),
          type: messageData.type,
          text: messageData.content.text?.substring(0, 30),
        });
        onMessage(messageData);
      } catch (err) {
        console.error("[Message SSE] Error parsing message:", err);
      }
    });

    eventSource.addEventListener("heartbeat", () => {
      if (isUnmountedRef.current) return;
      console.log("[Message SSE] 💓 Heartbeat");
      setIsConnected(true);
      onHeartbeat?.();
    });

    eventSource.onerror = () => {
      if (isUnmountedRef.current) return;

      console.error("[Message SSE] ❌ Connection error");
      setIsConnected(false);

      // Close the connection
      eventSource.close();
      eventSourceRef.current = null;
      currentRoomIdRef.current = null;

      // Attempt to reconnect with exponential backoff
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        const delay = Math.min(
          RECONNECT_DELAY *
            Math.pow(RECONNECT_BACKOFF_MULTIPLIER, reconnectAttempts),
          MAX_RECONNECT_DELAY,
        );

        setError(
          `Connection lost. Reconnecting... (${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`,
        );

        console.log(
          `[Message SSE] 🔄 Reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`,
        );

        setReconnectAttempts((prev) => prev + 1);

        reconnectTimeoutRef.current = setTimeout(() => {
          if (!isUnmountedRef.current) {
            connect();
          }
        }, delay);
      } else {
        setError(
          "Connection failed after multiple attempts. Please refresh the page.",
        );
        console.error(
          "[Message SSE] ❌ Max reconnection attempts reached. Please refresh.",
        );
      }
    };
  }, [roomId, onMessage, onConnected, onHeartbeat, reconnectAttempts]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (eventSourceRef.current) {
      console.log("[Message SSE] 🔌 Closing connection");
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      currentRoomIdRef.current = null;
      setIsConnected(false);
    }
  }, []);

  useEffect(() => {
    isUnmountedRef.current = false;

    if (roomId) {
      connect();
    }

    return () => {
      isUnmountedRef.current = true;
      disconnect();
    };
  }, [roomId, connect, disconnect]);

  return {
    isConnected,
    error,
    reconnectAttempts,
  };
}

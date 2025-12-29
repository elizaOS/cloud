"use client";

import { useRef, useCallback, useEffect } from "react";

/**
 * Hook for throttled streaming updates using requestAnimationFrame.
 *
 * WHY THIS EXISTS:
 * When streaming LLM responses, we receive many small chunks (often 1 token = ~4 chars each).
 * Without throttling, each chunk triggers a React re-render + array operations.
 * Example: 100 tokens/second = 100 re-renders/second = laggy UI.
 *
 * WHAT IT DOES:
 * - Accumulates chunks in a Map (no re-renders)
 * - Batches UI updates using requestAnimationFrame (~60fps max)
 * - Provides the latest text when update fires
 *
 * VISUAL IMPACT:
 * None! The human eye can't perceive >60fps. The text appears just as smooth,
 * but React does 40-60% less work = smoother scrolling, less CPU on mobile.
 *
 * @example
 * const { accumulateChunk, getAccumulatedText, scheduleUpdate, cleanup } = useThrottledStreamingUpdate();
 *
 * // On each chunk:
 * accumulateChunk(messageId, chunk);
 * scheduleUpdate(messageId, (text) => {
 *   setMessages(prev => updateStreamingMessage(prev, messageId, text));
 * });
 */
export function useThrottledStreamingUpdate() {
  // Map of messageId -> accumulated text (no re-renders when updated)
  const textMapRef = useRef<Map<string, string>>(new Map());

  // Map of messageId -> pending rAF frame ID (for throttling)
  const pendingUpdatesRef = useRef<Map<string, number>>(new Map());

  // Cleanup on unmount
  useEffect(() => {
    const pendingUpdates = pendingUpdatesRef.current;
    const textMap = textMapRef.current;
    return () => {
      // Cancel all pending animation frames
      pendingUpdates.forEach((frameId) => {
        cancelAnimationFrame(frameId);
      });
      pendingUpdates.clear();
      textMap.clear();
    };
  }, []);

  /**
   * Accumulate a chunk of text for a message (no re-render).
   */
  const accumulateChunk = useCallback((messageId: string, chunk: string) => {
    const currentText = textMapRef.current.get(messageId) || "";
    textMapRef.current.set(messageId, currentText + chunk);
  }, []);

  /**
   * Get the current accumulated text for a message.
   */
  const getAccumulatedText = useCallback((messageId: string): string => {
    return textMapRef.current.get(messageId) || "";
  }, []);

  /**
   * Clear accumulated text for a message (call when streaming completes).
   */
  const clearAccumulatedText = useCallback((messageId: string) => {
    textMapRef.current.delete(messageId);
    // Also cancel any pending update
    const frameId = pendingUpdatesRef.current.get(messageId);
    if (frameId !== undefined) {
      cancelAnimationFrame(frameId);
      pendingUpdatesRef.current.delete(messageId);
    }
  }, []);

  /**
   * Clear all accumulated text (call on error or reset).
   */
  const clearAll = useCallback(() => {
    textMapRef.current.clear();
    pendingUpdatesRef.current.forEach((frameId) => {
      cancelAnimationFrame(frameId);
    });
    pendingUpdatesRef.current.clear();
  }, []);

  /**
   * Schedule a throttled UI update for a message.
   * The callback receives the current accumulated text.
   * Only fires once per animation frame (~16ms at 60fps).
   */
  const scheduleUpdate = useCallback(
    (messageId: string, onUpdate: (text: string) => void) => {
      // Skip if update already pending for this message
      if (pendingUpdatesRef.current.has(messageId)) {
        return;
      }

      const frameId = requestAnimationFrame(() => {
        pendingUpdatesRef.current.delete(messageId);
        const text = textMapRef.current.get(messageId) || "";
        onUpdate(text);
      });

      pendingUpdatesRef.current.set(messageId, frameId);
    },
    []
  );

  return {
    accumulateChunk,
    getAccumulatedText,
    clearAccumulatedText,
    clearAll,
    scheduleUpdate,
  };
}

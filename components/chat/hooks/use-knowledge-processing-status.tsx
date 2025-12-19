"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { toast } from "sonner";

interface KnowledgeProcessingStatus {
  isProcessing: boolean;
  totalFiles: number;
  processedFiles: number;
  pendingCount: number;
  processingCount: number;
  completedCount: number;
  failedCount: number;
}

interface StatusWithCharacter {
  characterId: string;
  status: KnowledgeProcessingStatus;
}

/**
 * Hook to poll knowledge processing status for a character.
 * Polls every 3 seconds while files are processing.
 * Shows a toast notification when processing completes.
 *
 * @param characterId - The character ID to check processing status for.
 */
export function useKnowledgeProcessingStatus(characterId: string | null) {
  // Store status with its associated characterId to properly invalidate on character change
  const [statusData, setStatusData] = useState<StatusWithCharacter | null>(null);
  const wasProcessingRef = useRef(false);

  // Derive the actual status - return null if characterId doesn't match or is null
  const status = useMemo(() => {
    if (!characterId || statusData?.characterId !== characterId) {
      return null;
    }
    return statusData.status;
  }, [characterId, statusData]);

  // Initial fetch and polling
  useEffect(() => {
    if (!characterId) {
      return;
    }

    // Reset processing ref when character changes to prevent false completion toasts
    wasProcessingRef.current = false;

    // Local variable scoped to this effect run to prevent race conditions
    // when characterId changes. Each effect run gets its own isCurrentEffect.
    let isCurrentEffect = true;

    const fetchStatus = async (currentCharacterId: string) => {
      const response = await fetch(`/api/v1/knowledge/jobs/${currentCharacterId}`);

      // Check local variable - prevents stale responses from updating state
      // after characterId has changed during the fetch
      if (!isCurrentEffect) return;

      if (!response.ok) {
        toast.error("Failed to fetch knowledge processing status");
        return;
      }

      const data = await response.json() as KnowledgeProcessingStatus;
      setStatusData({ characterId: currentCharacterId, status: data });

      // Check if processing just completed
      if (wasProcessingRef.current && !data.isProcessing && data.totalFiles > 0) {
        if (data.failedCount > 0) {
          toast.success("Knowledge files processed", {
            description: `${data.completedCount} succeeded, ${data.failedCount} failed`,
            duration: 5000,
          });
        } else {
          toast.success("Knowledge base ready!", {
            description: `Successfully processed ${data.completedCount} file(s)`,
            duration: 4000,
          });
        }
        wasProcessingRef.current = false;
      } else if (data.isProcessing) {
        wasProcessingRef.current = true;
      }
    };

    // Initial fetch - pass characterId as argument to capture current value
    void fetchStatus(characterId);

    // Poll every 3 seconds while processing
    // Capture characterId in closure for interval callback
    const capturedCharacterId = characterId;
    const interval = setInterval(() => {
      if (wasProcessingRef.current) {
        void fetchStatus(capturedCharacterId);
      }
    }, 3000);

    return () => {
      isCurrentEffect = false;
      clearInterval(interval);
      wasProcessingRef.current = false;
    };
  }, [characterId]);

  return status;
}

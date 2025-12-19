"use client";

import { useState, useEffect, useRef } from "react";
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

/**
 * Hook to poll knowledge processing status for a character.
 * Polls every 3 seconds while files are processing.
 * Shows a toast notification when processing completes.
 *
 * @param characterId - The character ID to check processing status for.
 */
export function useKnowledgeProcessingStatus(characterId: string | null) {
  const [status, setStatus] = useState<KnowledgeProcessingStatus | null>(null);
  const wasProcessingRef = useRef(false);

  // Initial fetch and polling
  useEffect(() => {
    if (!characterId) {
      setStatus(null);
      return;
    }

    // Local variable scoped to this effect run to prevent race conditions
    // when characterId changes. Each effect run gets its own isCurrentEffect.
    let isCurrentEffect = true;

    const fetchStatus = async () => {
      const response = await fetch(`/api/v1/knowledge/jobs/${characterId}`);

      // Check local variable, not shared ref - prevents stale responses
      // from updating state after characterId has changed
      if (!isCurrentEffect) return;

      if (!response.ok) {
        toast.error("Failed to fetch knowledge processing status");
        return;
      }

      const data = await response.json() as KnowledgeProcessingStatus;
      setStatus(data);

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

    // Initial fetch
    void fetchStatus();

    // Poll every 3 seconds while processing
    const interval = setInterval(() => {
      if (wasProcessingRef.current) {
        void fetchStatus();
      }
    }, 3000);

    return () => {
      isCurrentEffect = false;
      clearInterval(interval);
    };
  }, [characterId]);
}

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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

  const fetchStatus = useCallback(async () => {
    if (!characterId) {
      setStatus(null);
      return;
    }

    const response = await fetch(`/api/v1/knowledge/jobs/${characterId}`);

    if (response.ok) {
      const data = await response.json();
      setStatus(data);

      // Check if processing just completed
      if (wasProcessingRef.current && !data.isProcessing && data.totalFiles > 0) {
        // Processing just finished
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
    }
  }, [characterId]);

  // Initial fetch
  useEffect(() => {
    if (characterId) {
      void fetchStatus();
    }
  }, [characterId, fetchStatus]);

  // Poll every 3 seconds while processing
  useEffect(() => {
    if (!characterId || !status?.isProcessing) return;

    const interval = setInterval(() => {
      void fetchStatus();
    }, 3000);

    return () => clearInterval(interval);
  }, [characterId, status?.isProcessing, fetchStatus]);
}

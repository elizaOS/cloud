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

const PENDING_KNOWLEDGE_KEY_PREFIX = "pendingKnowledge_";
const PENDING_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes - processing should complete within this time

/**
 * Marks a character as having pending knowledge processing.
 * Called after queuing files for processing.
 */
export function markKnowledgeProcessingPending(characterId: string): void {
  localStorage.setItem(
    `${PENDING_KNOWLEDGE_KEY_PREFIX}${characterId}`,
    Date.now().toString()
  );
}

/**
 * Checks if a character has pending knowledge processing that we should track.
 * Returns true if marked pending within the expiry window.
 */
function hasPendingKnowledgeProcessing(characterId: string): boolean {
  const timestamp = localStorage.getItem(`${PENDING_KNOWLEDGE_KEY_PREFIX}${characterId}`);
  if (!timestamp) return false;

  const pendingTime = parseInt(timestamp, 10);
  const isValid = Date.now() - pendingTime < PENDING_EXPIRY_MS;

  if (!isValid) {
    localStorage.removeItem(`${PENDING_KNOWLEDGE_KEY_PREFIX}${characterId}`);
  }

  return isValid;
}

/**
 * Clears the pending knowledge processing marker for a character.
 */
function clearPendingKnowledgeProcessing(characterId: string): void {
  localStorage.removeItem(`${PENDING_KNOWLEDGE_KEY_PREFIX}${characterId}`);
}

/**
 * Hook to poll knowledge processing status for a character.
 * Polls every 3 seconds while files are processing.
 * Shows a toast notification when processing completes.
 *
 * Uses localStorage to track pending processing state across navigation,
 * ensuring completion toasts are shown even if processing finishes
 * before this hook mounts.
 *
 * @param characterId - The character ID to check processing status for.
 */
export function useKnowledgeProcessingStatus(characterId: string | null) {
  const [statusData, setStatusData] = useState<StatusWithCharacter | null>(null);
  const wasProcessingRef = useRef(false);

  const status = useMemo(() => {
    if (!characterId || statusData?.characterId !== characterId) {
      return null;
    }
    return statusData.status;
  }, [characterId, statusData]);

  useEffect(() => {
    if (!characterId) {
      return;
    }

    wasProcessingRef.current = false;

    // Check if we have pending processing from a recent character creation.
    // This handles the case where processing completes before this hook mounts.
    const hadPendingProcessing = hasPendingKnowledgeProcessing(characterId);
    if (hadPendingProcessing) {
      wasProcessingRef.current = true;
    }

    let isCurrentEffect = true;

    const fetchStatus = async (currentCharacterId: string) => {
      const response = await fetch(`/api/v1/knowledge/jobs/${currentCharacterId}`);

      if (!isCurrentEffect) return;

      if (!response.ok) {
        wasProcessingRef.current = false;
        return;
      }

      const data = await response.json() as KnowledgeProcessingStatus;
      setStatusData({ characterId: currentCharacterId, status: data });

      if (wasProcessingRef.current && !data.isProcessing) {
        if (data.totalFiles > 0) {
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
        }
        // Clear pending state regardless of totalFiles to stop polling
        // This handles the case where localStorage has a pending marker but API returns no jobs
        wasProcessingRef.current = false;
        clearPendingKnowledgeProcessing(currentCharacterId);
      } else if (data.isProcessing) {
        wasProcessingRef.current = true;
      }
    };

    void fetchStatus(characterId);

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

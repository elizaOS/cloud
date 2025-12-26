"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
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

interface KnowledgeSSEEvent {
  type: string;
  data: {
    type?: string;
    characterId?: string;
    jobId?: string;
    filename?: string;
    data?: {
      status?: string;
      fragmentCount?: number;
      documentId?: string;
      error?: string;
      completedCount?: number;
      failedCount?: number;
      totalFiles?: number;
    };
  };
  timestamp: string;
}

const PENDING_KNOWLEDGE_KEY_PREFIX = "pendingKnowledge_";
const PENDING_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Marks a character as having pending knowledge processing.
 * Called after queuing files for processing.
 */
export function markKnowledgeProcessingPending(characterId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    `${PENDING_KNOWLEDGE_KEY_PREFIX}${characterId}`,
    Date.now().toString(),
  );
}

/**
 * Checks if a character has pending knowledge processing that we should track.
 */
function hasPendingKnowledgeProcessing(characterId: string): boolean {
  if (typeof window === "undefined") return false;

  const timestamp = localStorage.getItem(
    `${PENDING_KNOWLEDGE_KEY_PREFIX}${characterId}`,
  );
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
  if (typeof window === "undefined") return;
  localStorage.removeItem(`${PENDING_KNOWLEDGE_KEY_PREFIX}${characterId}`);
}

/**
 * Hook for real-time knowledge processing status updates via SSE.
 * Subscribes to server-sent events for instant notifications when files finish processing.
 * Falls back to polling if SSE is not available.
 *
 * @param characterId - The character ID to monitor processing status for.
 * @param options - Configuration options
 * @param options.onComplete - Callback when all processing completes
 * @param options.enabled - Whether to enable the subscription (default: true)
 */
export function useKnowledgeProcessingStatus(
  characterId: string | null,
  options: {
    onComplete?: () => void;
    enabled?: boolean;
  } = {},
) {
  const { onComplete, enabled = true } = options;
  const [statusData, setStatusData] = useState<StatusWithCharacter | null>(
    null,
  );
  const wasProcessingRef = useRef(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const onCompleteRef = useRef(onComplete);

  // Keep callback ref updated
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const status = useMemo(() => {
    if (!characterId || statusData?.characterId !== characterId) {
      return null;
    }
    return statusData.status;
  }, [characterId, statusData]);

  // Fetch initial status from REST API
  const fetchStatus = useCallback(
    async (currentCharacterId: string): Promise<KnowledgeProcessingStatus | null> => {
      const response = await fetch(
        `/api/v1/knowledge/jobs/${currentCharacterId}`,
        { credentials: "include" },
      );

      if (response.status === 403 || response.status === 404) {
        return null;
      }

      if (!response.ok) {
        return null;
      }

      return response.json();
    },
    [],
  );

  // Handle SSE events
  const handleSSEEvent = useCallback(
    (event: MessageEvent, currentCharacterId: string) => {
      const parsed: KnowledgeSSEEvent = JSON.parse(event.data);
      const eventType = parsed.data?.type || parsed.type;

      if (eventType === "heartbeat" || eventType === "connected") {
        return;
      }

      // Handle knowledge processing events
      if (
        eventType === "processing_completed" ||
        eventType === "processing_failed"
      ) {
        const eventData = parsed.data?.data;
        const filename = parsed.data?.filename;

        // Show toast for individual file completion
        if (eventType === "processing_completed" && filename) {
          toast.success(`Processed: ${filename}`, {
            description: `${eventData?.fragmentCount || 0} fragments created`,
            duration: 3000,
          });
        } else if (eventType === "processing_failed" && filename) {
          toast.error(`Failed: ${filename}`, {
            description: eventData?.error || "Processing failed",
            duration: 5000,
          });
        }

        // Fetch updated status to get accurate counts
        fetchStatus(currentCharacterId).then((newStatus) => {
          if (newStatus) {
            setStatusData({
              characterId: currentCharacterId,
              status: newStatus,
            });

            // Check if all processing is complete
            if (wasProcessingRef.current && !newStatus.isProcessing) {
              if (newStatus.totalFiles > 0) {
                if (newStatus.failedCount > 0) {
                  toast.success("Knowledge files processed", {
                    description: `${newStatus.completedCount} succeeded, ${newStatus.failedCount} failed`,
                    duration: 5000,
                  });
                } else {
                  toast.success("Knowledge base ready!", {
                    description: `Successfully processed ${newStatus.completedCount} file(s)`,
                    duration: 4000,
                  });
                }
              }

              wasProcessingRef.current = false;
              clearPendingKnowledgeProcessing(currentCharacterId);
              onCompleteRef.current?.();
            }
          }
        });
      }
    },
    [fetchStatus],
  );

  // Connect to SSE
  const connectSSE = useCallback(
    (currentCharacterId: string) => {
      // Close existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      const url = `/api/v1/knowledge/sse?characterId=${encodeURIComponent(currentCharacterId)}`;
      const eventSource = new EventSource(url, { withCredentials: true });
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        handleSSEEvent(event, currentCharacterId);
      };

      eventSource.onerror = () => {
        eventSource.close();
        eventSourceRef.current = null;

        // Reconnect after a delay if still processing
        if (wasProcessingRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            if (wasProcessingRef.current) {
              connectSSE(currentCharacterId);
            }
          }, 3000);
        }
      };

      return eventSource;
    },
    [handleSSEEvent],
  );

  useEffect(() => {
    if (!characterId || !enabled) {
      return;
    }

    wasProcessingRef.current = false;

    // Check if we have pending processing
    const hadPendingProcessing = hasPendingKnowledgeProcessing(characterId);
    if (hadPendingProcessing) {
      wasProcessingRef.current = true;
    }

    // Fetch initial status
    fetchStatus(characterId).then((initialStatus) => {
      if (initialStatus) {
        setStatusData({ characterId, status: initialStatus });

        if (initialStatus.isProcessing) {
          wasProcessingRef.current = true;
        }

        // If we were marked as pending but API shows no processing,
        // it means processing completed before we connected
        if (hadPendingProcessing && !initialStatus.isProcessing) {
          if (initialStatus.totalFiles > 0) {
            if (initialStatus.failedCount > 0) {
              toast.success("Knowledge files processed", {
                description: `${initialStatus.completedCount} succeeded, ${initialStatus.failedCount} failed`,
                duration: 5000,
              });
            } else {
              toast.success("Knowledge base ready!", {
                description: `Successfully processed ${initialStatus.completedCount} file(s)`,
                duration: 4000,
              });
            }
          }
          clearPendingKnowledgeProcessing(characterId);
          onCompleteRef.current?.();
          return;
        }
      }

      // Connect to SSE if processing is active
      if (wasProcessingRef.current) {
        connectSSE(characterId);
      }
    });

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [characterId, enabled, fetchStatus, connectSSE]);

  // Start SSE when processing begins
  const startMonitoring = useCallback(() => {
    if (characterId && !eventSourceRef.current) {
      wasProcessingRef.current = true;
      markKnowledgeProcessingPending(characterId);
      connectSSE(characterId);
    }
  }, [characterId, connectSSE]);

  return {
    status,
    isProcessing: status?.isProcessing ?? false,
    startMonitoring,
  };
}

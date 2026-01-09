"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";

interface PendingFile {
  blobUrl: string;
  filename: string;
  contentType: string;
  size: number;
}

interface PendingKnowledge {
  characterId: string;
  characterName: string;
  files: PendingFile[];
  createdAt: number;
  // Cross-tab processing claim to prevent duplicate processing
  processingBy?: {
    tabId: string;
    claimedAt: number;
  };
}

interface ProcessingState {
  status: "idle" | "processing" | "completed" | "error";
  totalFiles: number;
  processedFiles: number;
  successCount: number;
  failedCount: number;
  error?: string;
}

interface PendingKnowledgeProcessorProps {
  characterId: string | null;
  onProcessingComplete?: () => void;
}

const PENDING_KEY_PREFIX = "pendingKnowledge_";
const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes max age for pending files
const CLAIM_TIMEOUT_MS = 30 * 1000; // 30 seconds - if claim is older, consider it stale

// Generate a unique ID for this tab to prevent cross-tab duplicate processing
const generateTabId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

/**
 * Component that processes pending knowledge files after character creation.
 * Shows a banner while processing and allows user to chat meanwhile.
 */
export function PendingKnowledgeProcessor({
  characterId,
  onProcessingComplete,
}: PendingKnowledgeProcessorProps) {
  const [state, setState] = useState<ProcessingState>({
    status: "idle",
    totalFiles: 0,
    processedFiles: 0,
    successCount: 0,
    failedCount: 0,
  });
  const [dismissed, setDismissed] = useState(false);
  // Track which characterId is being processed (null = none)
  // This allows processing different characters if user switches
  const processingCharacterIdRef = useRef<string | null>(null);
  // Track previous characterId to detect switches
  const previousCharacterIdRef = useRef<string | null>(characterId);
  // Track current characterId prop for race condition prevention in async callbacks
  const currentCharacterIdRef = useRef<string | null>(characterId);
  // Unique ID for this tab to prevent cross-tab duplicate processing
  const tabIdRef = useRef<string>(generateTabId());

  // Keep ref in sync with prop
  useEffect(() => {
    currentCharacterIdRef.current = characterId;
  }, [characterId]);

  // Reset dismissed state when characterId changes
  // This allows processing pending files for a new character after dismissing for another
  useEffect(() => {
    if (characterId !== previousCharacterIdRef.current) {
      setDismissed(false);
      setState({
        status: "idle",
        totalFiles: 0,
        processedFiles: 0,
        successCount: 0,
        failedCount: 0,
      });
      previousCharacterIdRef.current = characterId;
    }
  }, [characterId]);

  const processFiles = useCallback(
    async (pending: PendingKnowledge) => {
      // Prevent duplicate processing for the same character
      if (processingCharacterIdRef.current === pending.characterId) return;
      processingCharacterIdRef.current = pending.characterId;

      const storageKey = `${PENDING_KEY_PREFIX}${pending.characterId}`;
      // Capture the characterId we're processing to check against current prop later
      const processingForCharacterId = pending.characterId;

      // Helper to check if we should update state (prevents race condition when user switches characters)
      const shouldUpdateState = () =>
        currentCharacterIdRef.current === processingForCharacterId;

      setState({
        status: "processing",
        totalFiles: pending.files.length,
        processedFiles: 0,
        successCount: 0,
        failedCount: 0,
      });

      try {
        const response = await fetch("/api/v1/knowledge/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            characterId: pending.characterId,
            files: pending.files,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const failedCount = data.failedCount ?? 0;
          const successCount = data.successCount ?? 0;

          // Handle sessionStorage based on processing results
          if (failedCount === 0) {
            // All files succeeded - clear sessionStorage
            try {
              sessionStorage.removeItem(storageKey);
            } catch {
              // sessionStorage may fail in private browsing
            }
          } else if (data.results && Array.isArray(data.results)) {
            // Partial failure - update sessionStorage to only contain failed files
            // This prevents re-processing already successful files on refresh
            const failedBlobUrls = new Set(
              data.results
                .filter((r: { status: string }) => r.status === "error")
                .map((r: { blobUrl: string }) => r.blobUrl)
            );
            const failedFiles = pending.files.filter((f) =>
              failedBlobUrls.has(f.blobUrl)
            );

            if (failedFiles.length > 0) {
              try {
                sessionStorage.setItem(
                  storageKey,
                  JSON.stringify({
                    ...pending,
                    files: failedFiles,
                    createdAt: Date.now(), // Reset timestamp for retry window
                  })
                );
              } catch {
                // sessionStorage may fail in private browsing
              }
            } else {
              // No failed files found (edge case) - clear storage
              try {
                sessionStorage.removeItem(storageKey);
              } catch {
                // sessionStorage may fail in private browsing
              }
            }
          }

          // Only update UI if user hasn't switched to a different character
          if (shouldUpdateState()) {
            setState({
              status: "completed",
              totalFiles: pending.files.length,
              processedFiles: pending.files.length,
              successCount,
              failedCount,
            });

            if (failedCount > 0) {
              toast.warning("Some files failed to process", {
                description: `${successCount} succeeded, ${failedCount} failed. You may need to re-upload failed files.`,
              });
            } else {
              toast.success("Knowledge base ready!", {
                description: `${successCount} file(s) processed successfully`,
              });
            }

            onProcessingComplete?.();
          }
        } else {
          const errorData = await response.json().catch(() => ({}));
          // Keep sessionStorage on error so user can retry
          // Only update UI if user hasn't switched to a different character
          if (shouldUpdateState()) {
            setState({
              status: "error",
              totalFiles: pending.files.length,
              processedFiles: 0,
              successCount: 0,
              failedCount: pending.files.length,
              error: errorData.error || "Failed to process files",
            });

            toast.error("File processing failed", {
              description: "You can try again from the Files tab",
            });
          }
        }
      } catch (error) {
        // Keep sessionStorage on network error so user can retry
        // Only update UI if user hasn't switched to a different character
        if (shouldUpdateState()) {
          setState({
            status: "error",
            totalFiles: pending.files.length,
            processedFiles: 0,
            successCount: 0,
            failedCount: pending.files.length,
            error: error instanceof Error ? error.message : "Network error",
          });

          toast.error("File processing failed", {
            description: "Network error - you can try again from the Files tab",
          });
        }
      } finally {
        processingCharacterIdRef.current = null;
      }
    },
    [onProcessingComplete],
  );

  useEffect(() => {
    if (!characterId || dismissed) return;

    const key = `${PENDING_KEY_PREFIX}${characterId}`;
    let stored: string | null = null;
    try {
      stored = sessionStorage.getItem(key);
    } catch {
      // sessionStorage may fail in private browsing
      return;
    }

    if (!stored) return;

    let pending: PendingKnowledge;
    try {
      pending = JSON.parse(stored);
    } catch {
      // Invalid JSON, remove corrupted data
      try { sessionStorage.removeItem(key); } catch { /* ignore */ }
      return;
    }

    // Check if pending data is too old (prevent processing stale data)
    if (Date.now() - pending.createdAt > MAX_AGE_MS) {
      try { sessionStorage.removeItem(key); } catch { /* ignore */ }
      return;
    }

    // Verify characterId matches
    if (pending.characterId !== characterId) {
      try { sessionStorage.removeItem(key); } catch { /* ignore */ }
      return;
    }

    // Cross-tab deduplication: check if another tab has claimed processing
    const myTabId = tabIdRef.current;
    if (pending.processingBy) {
      const { tabId, claimedAt } = pending.processingBy;
      const claimAge = Date.now() - claimedAt;

      // If another tab claimed it recently, skip processing
      if (tabId !== myTabId && claimAge < CLAIM_TIMEOUT_MS) {
        return;
      }
      // If claim is stale (tab may have crashed), we can take over
    }

    // Claim processing for this tab before starting
    try {
      const claimedPending: PendingKnowledge = {
        ...pending,
        processingBy: {
          tabId: myTabId,
          claimedAt: Date.now(),
        },
      };
      sessionStorage.setItem(key, JSON.stringify(claimedPending));
    } catch {
      // If we can't claim, another tab may process it
      // Continue anyway since this is best-effort deduplication
    }

    // Start processing
    processFiles(pending);
  }, [characterId, dismissed, processFiles]);

  // This component processes files in the background and shows toast notifications
  // No visible UI - just background processing with toast feedback
  return null;
}


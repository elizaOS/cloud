"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, FileText, CheckCircle2, AlertCircle, X } from "lucide-react";
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

  const processFiles = useCallback(
    async (pending: PendingKnowledge) => {
      const storageKey = `${PENDING_KEY_PREFIX}${pending.characterId}`;

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

          // Only clear sessionStorage on success - preserves data for retry on failure
          sessionStorage.removeItem(storageKey);

          setState({
            status: "completed",
            totalFiles: pending.files.length,
            processedFiles: pending.files.length,
            successCount: data.successCount || pending.files.length,
            failedCount: data.failedCount || 0,
          });

          if (data.failedCount > 0) {
            toast.success("Knowledge files processed", {
              description: `${data.successCount} succeeded, ${data.failedCount} failed`,
            });
          } else {
            toast.success("Knowledge base ready!", {
              description: `${data.successCount} file(s) processed successfully`,
            });
          }

          onProcessingComplete?.();
        } else {
          const errorData = await response.json().catch(() => ({}));
          // Keep sessionStorage on error so user can retry
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
      } catch (error) {
        // Keep sessionStorage on network error so user can retry
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
    },
    [onProcessingComplete],
  );

  useEffect(() => {
    if (!characterId || dismissed) return;

    const key = `${PENDING_KEY_PREFIX}${characterId}`;
    const stored = sessionStorage.getItem(key);

    if (!stored) return;

    const pending: PendingKnowledge = JSON.parse(stored);

    // Check if pending data is too old (prevent processing stale data)
    if (Date.now() - pending.createdAt > MAX_AGE_MS) {
      sessionStorage.removeItem(key);
      return;
    }

    // Verify characterId matches
    if (pending.characterId !== characterId) {
      sessionStorage.removeItem(key);
      return;
    }

    // Start processing - intentionally triggers state update to sync with sessionStorage
    // eslint-disable-next-line react-hooks/set-state-in-effect
    processFiles(pending);
  }, [characterId, dismissed, processFiles]);

  const handleDismiss = () => {
    setDismissed(true);
    if (characterId) {
      sessionStorage.removeItem(`${PENDING_KEY_PREFIX}${characterId}`);
    }
  };

  // Don't render if idle or dismissed
  if (state.status === "idle" || dismissed) {
    return null;
  }

  return (
    <div className="border-b border-white/10 bg-gradient-to-r from-[#FF5800]/10 to-transparent">
      <div className="px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {state.status === "processing" && (
            <>
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[#FF5800]/20">
                <Loader2 className="w-4 h-4 text-[#FF5800] animate-spin" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">
                  Processing knowledge files...
                </p>
                <p className="text-xs text-white/60 truncate">
                  {state.totalFiles} file(s) • You can chat while this runs
                </p>
              </div>
            </>
          )}

          {state.status === "completed" && (
            <>
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-500/20">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">
                  Knowledge base ready!
                </p>
                <p className="text-xs text-white/60 truncate">
                  {state.successCount} file(s) processed
                  {state.failedCount > 0 && `, ${state.failedCount} failed`}
                </p>
              </div>
            </>
          )}

          {state.status === "error" && (
            <>
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-red-500/20">
                <AlertCircle className="w-4 h-4 text-red-500" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">
                  File processing failed
                </p>
                <p className="text-xs text-white/60 truncate">
                  {state.error || "Try again from the Files tab"}
                </p>
              </div>
            </>
          )}
        </div>

        {(state.status === "completed" || state.status === "error") && (
          <button
            onClick={handleDismiss}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4 text-white/60" />
          </button>
        )}
      </div>
    </div>
  );
}


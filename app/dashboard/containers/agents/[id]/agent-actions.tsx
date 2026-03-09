/**
 * MilaidyAgentActions — client component for start/stop/snapshot/delete actions
 * on the agent detail page.
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play, Square, Camera, Trash2, Loader2 } from "lucide-react";
import { BrandCard, BrandButton } from "@/components/brand";

interface MilaidyAgentActionsProps {
  agentId: string;
  status: string;
}

export function MilaidyAgentActions({ agentId, status }: MilaidyAgentActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isRunning = status === "running";
  const isStopped = ["stopped", "error", "pending", "disconnected"].includes(status);
  const isBusy = ["provisioning"].includes(status);

  async function doAction(action: string, method = "POST") {
    setLoading(action);
    try {
      let url = `/api/v1/milaidy/agents/${agentId}`;
      let body: string | undefined;

      if (action === "provision") {
        url = `/api/v1/milaidy/agents/${agentId}/provision`;
      } else if (action === "snapshot") {
        url = `/api/v1/milaidy/agents/${agentId}/snapshot`;
      } else if (action === "delete") {
        method = "DELETE";
      } else if (action === "shutdown") {
        // The shutdown is via PATCH — if not available, inform user
        method = "PATCH";
        body = JSON.stringify({ action: "shutdown" });
      }

      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      if (action === "delete") {
        toast.success("Agent deleted");
        router.push("/dashboard/containers");
        return;
      }

      const messages: Record<string, string> = {
        provision: "Agent provisioning started",
        snapshot: "Snapshot saved",
        shutdown: "Agent shutdown initiated",
      };
      toast.success(messages[action] ?? "Done");
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Friendly messages for known errors
      if (action === "shutdown" && msg.includes("405")) {
        toast.error("Shutdown not available via API — check admin panel");
      } else {
        toast.error(`Action failed: ${msg}`);
      }
    } finally {
      setLoading(null);
      setShowDeleteConfirm(false);
    }
  }

  return (
    <BrandCard className="relative shadow-lg shadow-black/50" cornerSize="md">
      <div className="relative z-10 space-y-4">
        <div className="flex items-center gap-2 pb-4 border-b border-white/10">
          <span className="inline-block w-2 h-2 rounded-full bg-[#FF5800]" />
          <h2
            className="text-xl font-normal text-white"
            style={{ fontFamily: "var(--font-roboto-mono)" }}
          >
            Agent Actions
          </h2>
        </div>

        <div className="flex flex-wrap gap-3">
          {/* Start */}
          {isStopped && (
            <BrandButton
              variant="primary"
              size="sm"
              onClick={() => doAction("provision")}
              disabled={!!loading || isBusy}
            >
              {loading === "provision" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Start Agent
            </BrandButton>
          )}

          {/* Stop */}
          {isRunning && (
            <BrandButton
              variant="outline"
              size="sm"
              onClick={() => doAction("shutdown", "PATCH")}
              disabled={!!loading}
            >
              {loading === "shutdown" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Square className="h-4 w-4" />
              )}
              Stop Agent
            </BrandButton>
          )}

          {/* Snapshot */}
          {isRunning && (
            <BrandButton
              variant="outline"
              size="sm"
              onClick={() => doAction("snapshot")}
              disabled={!!loading}
            >
              {loading === "snapshot" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
              Save Snapshot
            </BrandButton>
          )}

          {/* Delete */}
          {!showDeleteConfirm ? (
            <BrandButton
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={!!loading}
              className="text-red-400 border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
            >
              <Trash2 className="h-4 w-4" />
              Delete Agent
            </BrandButton>
          ) : (
            <div className="flex items-center gap-2 p-3 rounded-none border border-red-500/30 bg-red-950/20">
              <span className="text-sm text-red-400" style={{ fontFamily: "var(--font-roboto-mono)" }}>
                Confirm delete?
              </span>
              <BrandButton
                variant="outline"
                size="sm"
                onClick={() => doAction("delete", "DELETE")}
                disabled={!!loading}
                className="text-red-400 border-red-500/50 hover:bg-red-500/20"
              >
                {loading === "delete" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : null}
                Yes, delete
              </BrandButton>
              <BrandButton
                variant="outline"
                size="sm"
                onClick={() => setShowDeleteConfirm(false)}
                className="text-white/60"
              >
                Cancel
              </BrandButton>
            </div>
          )}
        </div>

        {isBusy && (
          <p className="text-sm text-yellow-400/80 flex items-center gap-2" style={{ fontFamily: "var(--font-roboto-mono)" }}>
            <Loader2 className="h-4 w-4 animate-spin" />
            Agent is provisioning — actions will be available once running.
          </p>
        )}
      </div>
    </BrandCard>
  );
}

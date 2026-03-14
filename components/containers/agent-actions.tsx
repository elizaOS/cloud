/**
 * MiladyAgentActions — client component for start/stop/snapshot/delete actions
 * on the agent detail page.
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play, Square, Camera, Trash2, Loader2 } from "lucide-react";
import { BrandCard, BrandButton } from "@elizaos/ui";
import { useJobPoller } from "@/lib/hooks/use-job-poller";

interface MiladyAgentActionsProps {
  agentId: string;
  status: string;
}

export function MiladyAgentActions({
  agentId,
  status,
}: MiladyAgentActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const poller = useJobPoller({
    onComplete: () => toast.success("Agent provisioning completed"),
    onFailed: (job) => toast.error(job.error ?? "Provisioning failed"),
  });

  const trackedJob = poller.getStatus(agentId);
  const effectiveStatus = poller.isActive(agentId) ? "provisioning" : status;

  const isRunning = effectiveStatus === "running";
  const isStopped = ["stopped", "error", "pending", "disconnected"].includes(
    effectiveStatus,
  );
  const isBusy = effectiveStatus === "provisioning";

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
        method = "PATCH";
        body = JSON.stringify({ action: "shutdown" });
      }

      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body,
      });

      const data = await res.json().catch(() => ({}));

      if (action === "provision" && res.status === 409) {
        const jobId = (data as { data?: { jobId?: string } }).data?.jobId;
        if (jobId) {
          poller.track(agentId, jobId);
          toast.info("Provisioning already in progress");
          return;
        }
      }

      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ?? `HTTP ${res.status}`,
        );
      }

      if (action === "delete") {
        toast.success("Agent deleted");
        router.push("/dashboard/containers");
        return;
      }

      if (action === "provision" && res.status === 202) {
        const jobId = (data as { data?: { jobId?: string } }).data?.jobId;
        if (jobId) {
          poller.track(agentId, jobId);
          toast.success("Agent provisioning queued");
          return;
        }

        toast.success("Agent provisioning started");
        router.refresh();
        return;
      }

      const messages: Record<string, string> = {
        provision: "Agent provisioning started",
        snapshot: "Snapshot saved",
        shutdown: "Agent shutdown complete",
      };
      toast.success(messages[action] ?? "Done");
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Action failed: ${msg}`);
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

          {isRunning && (
            <BrandButton
              variant="outline"
              size="sm"
              onClick={() => doAction("shutdown", "PATCH")}
              disabled={!!loading || isBusy}
            >
              {loading === "shutdown" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Square className="h-4 w-4" />
              )}
              Stop Agent
            </BrandButton>
          )}

          {isRunning && (
            <BrandButton
              variant="outline"
              size="sm"
              onClick={() => doAction("snapshot")}
              disabled={!!loading || isBusy}
            >
              {loading === "snapshot" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
              Save Snapshot
            </BrandButton>
          )}

          {!showDeleteConfirm ? (
            <BrandButton
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={!!loading || isBusy}
              className="text-red-400 border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
            >
              <Trash2 className="h-4 w-4" />
              Delete Agent
            </BrandButton>
          ) : (
            <div className="flex items-center gap-2 p-3 rounded-none border border-red-500/30 bg-red-950/20">
              <span
                className="text-sm text-red-400"
                style={{ fontFamily: "var(--font-roboto-mono)" }}
              >
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

        {poller.isActive(agentId) && (
          <div className="space-y-1">
            <p
              className="text-sm text-yellow-400/80 flex items-center gap-2"
              style={{ fontFamily: "var(--font-roboto-mono)" }}
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              Agent is provisioning. This page will refresh when the job
              finishes.
            </p>
            {trackedJob && (
              <p
                className="text-xs text-white/40"
                style={{ fontFamily: "var(--font-roboto-mono)" }}
              >
                Job {trackedJob.jobId.slice(0, 8)} • {trackedJob.status}
              </p>
            )}
          </div>
        )}
      </div>
    </BrandCard>
  );
}

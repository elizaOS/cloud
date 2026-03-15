"use client";

import {
  BrandButton,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@elizaos/cloud-ui";
import { Check, ExternalLink, Loader2, Plus, RotateCcw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AGENT_FLAVORS, getDefaultFlavor, getFlavorById } from "@/lib/constants/agent-flavors";
import { useSandboxStatusPoll, type SandboxStatus } from "@/lib/hooks/use-sandbox-status-poll";
import { getClientSafeMiladyAgentWebUiUrl } from "@/lib/milady-web-ui";
import { openWebUIWithPairing } from "@/lib/hooks/open-web-ui";

// ----------------------------------------------------------------
// Provisioning Steps
// ----------------------------------------------------------------

interface StepConfig {
  label: string;
  matchStatuses: SandboxStatus[];
}

const PROVISIONING_STEPS: StepConfig[] = [
  { label: "Agent created", matchStatuses: [] },
  { label: "Provisioning database", matchStatuses: ["pending"] },
  { label: "Starting container", matchStatuses: ["provisioning"] },
  { label: "Agent running", matchStatuses: ["running"] },
];

function getActiveStepIndex(status: SandboxStatus): number {
  if (status === "running") return 3;
  if (status === "provisioning") return 2;
  if (status === "pending") return 1;
  return 0;
}

type StepState = "complete" | "active" | "pending" | "error";

function getStepState(
  stepIndex: number,
  activeIndex: number,
  hasError: boolean,
): StepState {
  if (hasError && stepIndex === activeIndex) return "error";
  if (stepIndex < activeIndex) return "complete";
  if (stepIndex === activeIndex) return "active";
  return "pending";
}

// ----------------------------------------------------------------
// Step Indicator Component
// ----------------------------------------------------------------

function StepIndicator({ state }: { state: StepState }) {
  switch (state) {
    case "complete":
      return (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-500/20 text-green-400 ring-1 ring-green-500/40">
          <Check className="h-3.5 w-3.5" />
        </div>
      );
    case "active":
      return (
        <div className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FF5800]/20 ring-1 ring-[#FF5800]/40">
          <Loader2 className="h-3.5 w-3.5 text-[#FF5800] animate-spin" />
          <span className="absolute inset-0 rounded-full animate-ping bg-[#FF5800]/10" />
        </div>
      );
    case "error":
      return (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-red-400 ring-1 ring-red-500/40 animate-[shake_0.3s_ease-in-out]">
          <X className="h-3.5 w-3.5" />
        </div>
      );
    case "pending":
    default:
      return (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/10">
          <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
        </div>
      );
  }
}

// ----------------------------------------------------------------
// Provisioning Progress View
// ----------------------------------------------------------------

function ProvisioningProgress({
  status,
  error,
  agentId,
  elapsedSec,
  onClose,
  onRetry,
}: {
  status: SandboxStatus;
  error: string | null;
  agentId: string;
  elapsedSec: number;
  onClose: () => void;
  onRetry: () => void;
}) {
  const activeIndex = getActiveStepIndex(status);
  const hasError = status === "error";
  const isComplete = status === "running";

  return (
    <div className="space-y-5 py-1">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-300">
          {isComplete
            ? "Your agent is ready!"
            : hasError
              ? "Something went wrong"
              : "Setting up your agent..."}
        </p>
        {!isComplete && !hasError && (
          <span className="text-xs tabular-nums text-neutral-500">
            {elapsedSec < 60
              ? `${elapsedSec}s`
              : `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s`}
            {" · usually ~90s"}
          </span>
        )}
      </div>

      {/* Steps */}
      <div className="relative space-y-0">
        {PROVISIONING_STEPS.map((step, i) => {
          const state = getStepState(i, activeIndex, hasError);
          const isLast = i === PROVISIONING_STEPS.length - 1;
          return (
            <div key={step.label} className="flex items-start gap-3 relative">
              {/* Vertical connector line */}
              {!isLast && (
                <div
                  className="absolute left-[13px] top-7 w-px"
                  style={{ height: "calc(100% - 4px)" }}
                >
                  <div
                    className={`h-full w-full transition-colors duration-500 ${
                      state === "complete"
                        ? "bg-green-500/40"
                        : state === "error"
                          ? "bg-red-500/30"
                          : "bg-white/8"
                    }`}
                  />
                </div>
              )}
              <StepIndicator state={state} />
              <div className="pb-5 pt-1">
                <p
                  className={`text-sm transition-colors duration-300 ${
                    state === "complete"
                      ? "text-green-400"
                      : state === "active"
                        ? "text-white"
                        : state === "error"
                          ? "text-red-400"
                          : "text-neutral-600"
                  }`}
                >
                  {step.label}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Error message */}
      {hasError && error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5 space-y-2">
          <p className="text-sm text-red-400">{error}</p>
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 text-xs text-red-300 hover:text-white transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            Retry provisioning
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        {isComplete ? (
          <>
            <BrandButton
              size="sm"
              onClick={() => openWebUIWithPairing(agentId)}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open Web UI
            </BrandButton>
            <BrandButton variant="outline" size="sm" onClick={onClose}>
              Done
            </BrandButton>
          </>
        ) : (
          <BrandButton variant="outline" size="sm" onClick={onClose}>
            {hasError ? "Close" : "Close — provisioning continues in background"}
          </BrandButton>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------
// Main Dialog Component
// ----------------------------------------------------------------

interface CreateMiladySandboxDialogProps {
  trigger?: ReactNode;
  onProvisionQueued?: (agentId: string, jobId: string) => void;
}

type CreatePhase = "form" | "creating" | "provisioning";

export function CreateMiladySandboxDialog({
  trigger,
  onProvisionQueued,
}: CreateMiladySandboxDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [flavorId, setFlavorId] = useState(getDefaultFlavor().id);
  const [customImage, setCustomImage] = useState("");
  const [autoStart, setAutoStart] = useState(true);
  const [phase, setPhase] = useState<CreatePhase>("form");
  const [error, setError] = useState<string | null>(null);
  const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);
  const [provisionStartTime, setProvisionStartTime] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  const busy = phase === "creating";
  const isProvisioningPhase = phase === "provisioning";
  const selectedFlavor = getFlavorById(flavorId);
  const isCustom = flavorId === "custom";
  const resolvedDockerImage = isCustom ? customImage.trim() : selectedFlavor?.dockerImage;

  // Poll the agent status while in provisioning phase
  const pollResult = useSandboxStatusPoll(
    isProvisioningPhase ? createdAgentId : null,
    { intervalMs: 5_000, enabled: isProvisioningPhase },
  );

  // Elapsed time counter
  useEffect(() => {
    if (!provisionStartTime) {
      setElapsedSec(0);
      return;
    }
    const tick = () => setElapsedSec(Math.floor((Date.now() - provisionStartTime) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [provisionStartTime]);

  // When provisioning completes, refresh the table data
  useEffect(() => {
    if (isProvisioningPhase && pollResult.status === "running") {
      router.refresh();
      toast.success("Agent is up and running!");
    }
  }, [isProvisioningPhase, pollResult.status, router]);

  function resetForm() {
    setAgentName("");
    setFlavorId(getDefaultFlavor().id);
    setCustomImage("");
    setError(null);
    setPhase("form");
    setCreatedAgentId(null);
    setProvisionStartTime(null);
    setElapsedSec(0);
  }

  function handleClose() {
    setOpen(false);
    // Delay reset so the closing animation finishes
    setTimeout(resetForm, 300);
    router.refresh();
  }

  async function handleCreate() {
    const trimmedName = agentName.trim();
    if (!trimmedName || busy) return;

    setError(null);
    setPhase("creating");

    try {
      const createBody: Record<string, string | undefined> = {
        agentName: trimmedName,
      };
      if (resolvedDockerImage && flavorId !== getDefaultFlavor().id) {
        createBody.dockerImage = resolvedDockerImage;
      }

      const createRes = await fetch("/api/v1/milady/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createBody),
      });

      const createData = await createRes.json().catch(() => ({}));
      if (!createRes.ok) {
        throw new Error(
          (createData as { error?: string }).error ?? `Create failed (${createRes.status})`,
        );
      }

      const agentId = (createData as { data?: { id?: string } }).data?.id;
      if (!agentId) {
        throw new Error("Sandbox created but no agent id was returned");
      }

      setCreatedAgentId(agentId);

      if (autoStart) {
        // Transition to provisioning view instead of closing
        setPhase("provisioning");
        setProvisionStartTime(Date.now());

        const provisionRes = await fetch(`/api/v1/milady/agents/${agentId}/provision`, {
          method: "POST",
        });
        const provisionData = await provisionRes.json().catch(() => ({}));

        if (provisionRes.status === 202 || provisionRes.status === 409) {
          const jobId = (provisionData as { data?: { jobId?: string } }).data?.jobId;
          if (jobId) {
            onProvisionQueued?.(agentId, jobId);
          }
          // Stay in provisioning view — the polling hook will track status
        } else if (provisionRes.ok) {
          // Already running (synchronous provision)
          toast.success("Agent is running");
          handleClose();
        } else {
          toast.warning(
            (provisionData as { error?: string }).error ??
              "Sandbox created, but auto-start failed. You can start it from the table.",
          );
          handleClose();
        }
      } else {
        toast.success(`Sandbox "${trimmedName}" created`);
        handleClose();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setPhase("form");
      toast.error(message);
    }
  }

  async function handleRetryProvision() {
    if (!createdAgentId) return;
    setProvisionStartTime(Date.now());

    try {
      const res = await fetch(`/api/v1/milady/agents/${createdAgentId}/provision`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 202 || res.status === 409) {
        const jobId = (data as { data?: { jobId?: string } }).data?.jobId;
        if (jobId) {
          onProvisionQueued?.(createdAgentId, jobId);
        }
        toast.info("Retrying provisioning...");
      } else if (!res.ok) {
        toast.error((data as { error?: string }).error ?? "Retry failed");
      }
    } catch (err) {
      toast.error(`Retry failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <>
      {trigger ? (
        <div onClick={() => phase === "form" && setOpen(true)}>{trigger}</div>
      ) : (
        <BrandButton size="sm" onClick={() => setOpen(true)} disabled={busy}>
          <Plus className="h-4 w-4" />
          New Sandbox
        </BrandButton>
      )}

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !busy) {
            handleClose();
          }
        }}
      >
        <DialogContent className="sm:max-w-md bg-neutral-900 border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white">
              {isProvisioningPhase ? "Launching Agent" : "Create Milady Sandbox"}
            </DialogTitle>
            {!isProvisioningPhase && (
              <DialogDescription className="text-neutral-400">
                Create a new agent sandbox and optionally start provisioning right away.
              </DialogDescription>
            )}
          </DialogHeader>

          {isProvisioningPhase ? (
            <ProvisioningProgress
              status={pollResult.status}
              error={pollResult.error}
              agentId={createdAgentId!}
              elapsedSec={elapsedSec}
              onClose={handleClose}
              onRetry={handleRetryProvision}
            />
          ) : (
            <>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="milady-agent-name" className="text-neutral-300">
                    Agent Name
                  </Label>
                  <Input
                    id="milady-agent-name"
                    placeholder="e.g. milady-alpha"
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    disabled={busy}
                    className="bg-black/40 border-white/10 text-white placeholder:text-neutral-600"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleCreate();
                      }
                    }}
                    maxLength={100}
                    autoFocus
                  />
                </div>

                {/* Flavor selector */}
                <div className="space-y-2">
                  <Label htmlFor="milady-flavor" className="text-neutral-300">
                    Agent Flavor
                  </Label>
                  <Select value={flavorId} onValueChange={setFlavorId} disabled={busy}>
                    <SelectTrigger
                      id="milady-flavor"
                      className="bg-black/40 border-white/10 text-white"
                    >
                      <SelectValue placeholder="Select flavor" />
                    </SelectTrigger>
                    <SelectContent className="rounded-lg border-white/10 bg-neutral-900">
                      {AGENT_FLAVORS.map((flavor) => (
                        <SelectItem key={flavor.id} value={flavor.id}>
                          <div className="flex flex-col">
                            <span>{flavor.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedFlavor && (
                    <p className="text-xs text-neutral-500">{selectedFlavor.description}</p>
                  )}
                </div>

                {/* Custom image input */}
                {isCustom && (
                  <div className="space-y-2">
                    <Label htmlFor="milady-custom-image" className="text-neutral-300">
                      Docker Image
                    </Label>
                    <Input
                      id="milady-custom-image"
                      placeholder="e.g. myregistry/agent:latest"
                      value={customImage}
                      onChange={(e) => setCustomImage(e.target.value)}
                      disabled={busy}
                      className="bg-black/40 border-white/10 text-white placeholder:text-neutral-600"
                      maxLength={256}
                    />
                  </div>
                )}

                <div className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <div>
                    <Label htmlFor="milady-auto-start" className="text-sm text-neutral-300">
                      Start immediately after creation
                    </Label>
                    <p className="text-xs text-neutral-500">
                      Queue provisioning as soon as the sandbox record is created.
                    </p>
                  </div>
                  <Switch
                    id="milady-auto-start"
                    checked={autoStart}
                    onCheckedChange={setAutoStart}
                    disabled={busy}
                  />
                </div>

                {error && (
                  <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                    {error}
                  </p>
                )}
              </div>

              <DialogFooter>
                <BrandButton variant="outline" onClick={handleClose} disabled={busy}>
                  Cancel
                </BrandButton>
                <BrandButton
                  onClick={() => void handleCreate()}
                  disabled={!agentName.trim() || busy || (isCustom && !customImage.trim())}
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {busy
                    ? "Creating..."
                    : autoStart
                      ? "Create & Start"
                      : "Create Sandbox"}
                </BrandButton>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

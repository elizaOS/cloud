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
  Switch,
} from "@elizaos/ui";
import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

interface CreateMiladySandboxDialogProps {
  trigger?: ReactNode;
  onProvisionQueued?: (agentId: string, jobId: string) => void;
}

type CreatePhase = "idle" | "creating" | "provisioning";

export function CreateMiladySandboxDialog({
  trigger,
  onProvisionQueued,
}: CreateMiladySandboxDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [autoStart, setAutoStart] = useState(true);
  const [phase, setPhase] = useState<CreatePhase>("idle");
  const [error, setError] = useState<string | null>(null);

  const busy = phase !== "idle";

  async function handleCreate() {
    const trimmedName = agentName.trim();
    if (!trimmedName || busy) return;

    setError(null);
    setPhase("creating");

    try {
      const createRes = await fetch("/api/v1/milady/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentName: trimmedName }),
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

      toast.success(`Sandbox "${trimmedName}" created`);

      if (autoStart) {
        setPhase("provisioning");
        const provisionRes = await fetch(`/api/v1/milady/agents/${agentId}/provision`, {
          method: "POST",
        });
        const provisionData = await provisionRes.json().catch(() => ({}));

        if (provisionRes.status === 202 || provisionRes.status === 409) {
          const jobId = (provisionData as { data?: { jobId?: string } }).data?.jobId;
          if (jobId) {
            onProvisionQueued?.(agentId, jobId);
          }
          toast.info(
            provisionRes.status === 409
              ? jobId
                ? `Provisioning already in progress, job ${jobId.slice(0, 8)} is running`
                : "Provisioning is already in progress."
              : jobId
                ? `Provisioning queued, job ${jobId.slice(0, 8)} is running`
                : "Provisioning queued. This usually takes about 90 seconds.",
          );
        } else if (provisionRes.ok) {
          toast.success("Sandbox is running");
        } else {
          toast.warning(
            (provisionData as { error?: string }).error ??
              "Sandbox created, but auto-start failed. You can start it from the table.",
          );
        }
      }

      setOpen(false);
      setAgentName("");
      setError(null);
      setPhase("idle");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setPhase("idle");
      toast.error(message);
    }
  }

  return (
    <>
      {trigger ? (
        <div onClick={() => !busy && setOpen(true)}>{trigger}</div>
      ) : (
        <BrandButton size="sm" onClick={() => setOpen(true)} disabled={busy}>
          <Plus className="h-4 w-4" />
          New Sandbox
        </BrandButton>
      )}

      <Dialog open={open} onOpenChange={(nextOpen) => !busy && setOpen(nextOpen)}>
        <DialogContent className="sm:max-w-md bg-neutral-900 border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white">Create Milady Sandbox</DialogTitle>
            <DialogDescription className="text-neutral-400">
              Create a new agent sandbox and optionally start provisioning right away.
            </DialogDescription>
          </DialogHeader>

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
            <BrandButton variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </BrandButton>
            <BrandButton onClick={() => void handleCreate()} disabled={!agentName.trim() || busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {phase === "creating"
                ? "Creating..."
                : phase === "provisioning"
                  ? "Queueing..."
                  : autoStart
                    ? "Create & Start"
                    : "Create Sandbox"}
            </BrandButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

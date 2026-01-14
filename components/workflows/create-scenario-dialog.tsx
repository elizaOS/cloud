"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createWorkflow } from "@/app/actions/workflows";
import { Loader2, FileCode, LayoutTemplate } from "lucide-react";

interface CreateScenarioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateScenarioDialog({
  open,
  onOpenChange,
}: CreateScenarioDialogProps) {
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();

  const handleClose = () => {
    onOpenChange(false);
  };

  const handleCreateFromScratch = async () => {
    setIsCreating(true);

    try {
      const workflow = await createWorkflow({
        name: "New scenario",
      });

      handleClose();
      router.push(`/dashboard/workflows/${workflow.id}`);
    } catch (error) {
      console.error("Failed to create workflow:", error);
      alert(
        `Failed to create workflow: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleUseTemplate = () => {
    alert("Templates coming soon!");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px] rounded-md">
        <DialogHeader>
          <DialogTitle className="text-center text-xl">
            Create scenario
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-6">
          <button
            onClick={handleCreateFromScratch}
            disabled={isCreating}
            className="flex items-center gap-4 p-4 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all text-left disabled:opacity-50"
          >
            <div className="p-3 bg-[#FF5800]/20 rounded-lg">
              {isCreating ? (
                <Loader2 className="w-6 h-6 text-[#FF5800] animate-spin" />
              ) : (
                <FileCode className="w-6 h-6 text-[#FF5800]" />
              )}
            </div>
            <div>
              <div className="font-semibold text-white">
                {isCreating ? "Creating..." : "Create from scratch"}
              </div>
              <div className="text-sm text-white/60">
                Build a custom workflow from the ground up
              </div>
            </div>
          </button>

          <button
            onClick={handleUseTemplate}
            disabled={isCreating}
            className="flex items-center gap-4 p-4 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all text-left disabled:opacity-50"
          >
            <div className="p-3 bg-blue-500/20 rounded-lg">
              <LayoutTemplate className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <div className="font-semibold text-white">Use template</div>
              <div className="text-sm text-white/60">
                Start with a pre-built workflow template
              </div>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Workflow, MoreHorizontal, Trash2, Edit } from "lucide-react";
import type { Workflow as WorkflowType } from "@/db/schemas";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreateWorkflowDialog } from "./create-workflow-dialog";
import { deleteWorkflow } from "@/app/actions/workflows";
import { useRouter } from "next/navigation";

interface WorkflowsListProps {
  workflows: WorkflowType[];
}

export function WorkflowsList({ workflows }: WorkflowsListProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const router = useRouter();

  const handleDelete = async (workflowId: string) => {
    await deleteWorkflow(workflowId);
    router.refresh();
  };

  if (workflows.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center justify-center h-[400px] border border-dashed border-white/20 rounded-xl">
          <div className="p-4 bg-white/5 rounded-full mb-4">
            <Workflow className="w-8 h-8 text-white/40" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">
            No workflows yet
          </h3>
          <p className="text-white/60 text-sm mb-6 text-center max-w-md">
            Create your first workflow to automate tasks with AI agents, image
            generation, and more.
          </p>
          <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Create Workflow
          </Button>
        </div>

        <CreateWorkflowDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
        />
      </>
    );
  }

  return (
    <>
      <div className="flex justify-end mb-6">
        <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Create Workflow
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {workflows.map((workflow) => (
          <Link
            key={workflow.id}
            href={`/dashboard/workflows/${workflow.id}`}
            className="group block p-4 bg-white/5 border border-white/10 rounded-xl hover:border-white/20 hover:bg-white/[0.07] transition-all"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="p-2 bg-orange-500/20 rounded-lg">
                <Workflow className="w-5 h-5 text-orange-400" />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => e.preventDefault()}
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href={`/dashboard/workflows/${workflow.id}`}>
                      <Edit className="w-4 h-4 mr-2" />
                      Edit
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-red-400"
                    onClick={(e) => {
                      e.preventDefault();
                      handleDelete(workflow.id);
                    }}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <h3 className="text-white font-semibold mb-1">{workflow.name}</h3>
            {workflow.description && (
              <p className="text-white/60 text-sm line-clamp-2 mb-3">
                {workflow.description}
              </p>
            )}

            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-0.5 text-xs rounded-full ${
                  workflow.status === "active"
                    ? "bg-green-500/20 text-green-400"
                    : workflow.status === "paused"
                      ? "bg-yellow-500/20 text-yellow-400"
                      : "bg-white/10 text-white/60"
                }`}
              >
                {workflow.status}
              </span>
              <span className="text-white/40 text-xs">
                {workflow.nodes.length} nodes
              </span>
            </div>
          </Link>
        ))}
      </div>

      <CreateWorkflowDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
      />
    </>
  );
}

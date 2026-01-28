"use client";

import { WorkflowCard, type Workflow } from "./workflow-card";
export type { Workflow };
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WorkflowListProps {
  workflows: Workflow[];
  onView: (workflow: Workflow) => void;
  onExecute: (workflow: Workflow) => void;
  onDelete: (workflow: Workflow) => void;
  onShare?: (workflow: Workflow) => void;
  onCreate?: () => void;
  isLoading?: boolean;
}

function WorkflowSkeleton() {
  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-60" />
        </div>
        <Skeleton className="h-5 w-16" />
      </div>
      <div className="flex gap-1">
        <Skeleton className="h-5 w-14" />
        <Skeleton className="h-5 w-14" />
      </div>
      <div className="flex justify-between">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-24" />
      </div>
    </div>
  );
}

export function WorkflowList({
  workflows,
  onView,
  onExecute,
  onDelete,
  onShare,
  onCreate,
  isLoading = false,
}: WorkflowListProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <WorkflowSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (workflows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center border rounded-lg border-dashed">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <Sparkles className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-lg font-semibold mb-2">No workflows yet</h3>
        <p className="text-muted-foreground max-w-sm mb-6">
          Create your first AI-powered workflow using natural language. Just describe
          what you want to automate.
        </p>
        {onCreate && (
          <Button 
            onClick={onCreate}
            size="lg"
            data-testid="create-first-workflow-button"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Your First Workflow
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {workflows.map((workflow) => (
        <WorkflowCard
          key={workflow.id}
          workflow={workflow}
          onView={onView}
          onExecute={onExecute}
          onDelete={onDelete}
          onShare={onShare}
        />
      ))}
    </div>
  );
}

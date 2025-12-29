/**
 * Empty state component for my agents page when no agents exist.
 * Provides call-to-action button to create a new agent.
 *
 * @param props - Empty state configuration
 * @param props.onCreateNew - Callback when create button is clicked
 */

"use client";

import { CornerBrackets, LockOnButton } from "@/components/brand";
import { Plus } from "lucide-react";

interface EmptyStateProps {
  onCreateNew: () => void;
}

export function EmptyState({ onCreateNew }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4">
      <CornerBrackets size="md" color="#E1E1E1" />
      <h3 className="text-lg font-medium text-neutral-500">No agents yet</h3>
      <LockOnButton
        onClick={() => (window.location.href = "/dashboard/build")}
        icon={<Plus className="h-4 w-4" />}
      >
        Create New Agent
      </LockOnButton>
    </div>
  );
}

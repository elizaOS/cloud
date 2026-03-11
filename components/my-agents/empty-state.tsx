/**
 * Empty state component for my agents page when no agents exist.
 */
"use client";

import { EmptyState } from "@elizaos/ui";
import { BrandButton } from "@elizaos/ui";
import { Plus } from "lucide-react";

interface EmptyStateProps {
  onCreateNew: () => void;
}

export function AgentsEmptyState({ onCreateNew }: EmptyStateProps) {
  return (
    <EmptyState
      title="No agents yet"
      action={
        <BrandButton
          onClick={() => (window.location.href = "/dashboard/build")}
          className="bg-[#FF5800] text-white hover:bg-[#FF5800]/90 active:bg-[#FF5800]/80"
        >
          <Plus className="h-4 w-4" />
          Create Agent
        </BrandButton>
      }
    />
  );
}

// Keep backward-compatible export
export { AgentsEmptyState as EmptyState };

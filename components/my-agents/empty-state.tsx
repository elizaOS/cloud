/**
 * Empty state component for my agents page when no agents exist.
 * Provides call-to-action buttons to create agent or browse marketplace.
 *
 * @param props - Empty state configuration
 * @param props.onCreateNew - Callback when create button is clicked
 */

"use client";

import { BrandCard, BrandButton, CornerBrackets } from "@/components/brand";
import { Plus, Bot, Store } from "lucide-react";
import { useRouter } from "next/navigation";

interface EmptyStateProps {
  onCreateNew: () => void;
}

export function EmptyState({ onCreateNew }: EmptyStateProps) {
  const router = useRouter();

  return (
    <div className="flex items-center justify-center h-full min-h-[400px]">
      <BrandCard className="relative max-w-md w-full p-8">
        <CornerBrackets size="md" className="opacity-50" />
        <div className="relative z-10 text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-[#FF5800]/20 flex items-center justify-center">
              <Bot className="h-8 w-8 text-[#FF5800]" />
            </div>
          </div>

          <h3 className="text-xl font-bold text-white">No Agents Yet</h3>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <BrandButton onClick={onCreateNew}>
              <Plus className="h-4 w-4 mr-2" />
              Create Agent
            </BrandButton>
            <BrandButton
              variant="outline"
              onClick={() => router.push("/marketplace")}
            >
              <Store className="h-4 w-4 mr-2" />
              Marketplace
            </BrandButton>
          </div>
        </div>
      </BrandCard>
    </div>
  );
}

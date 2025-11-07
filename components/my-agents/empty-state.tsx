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
      <BrandCard className="relative max-w-2xl w-full p-12">
        <CornerBrackets size="md" className="opacity-50" />
        <div className="relative z-10 text-center space-y-6">
          {/* Icon */}
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full bg-[#FF5800]/20 flex items-center justify-center">
              <Bot className="h-10 w-10 text-[#FF5800]" />
            </div>
          </div>

          {/* Text */}
          <div className="space-y-2">
            <h3 className="text-2xl font-bold text-white">No Agents Yet</h3>
            <p className="text-white/60 max-w-md mx-auto">
              Create your first AI agent to get started, or browse the marketplace
              to discover and clone existing agents.
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
            <BrandButton onClick={onCreateNew} size="lg">
              <Plus className="h-5 w-5 mr-2" />
              Create Your First Agent
            </BrandButton>
            <BrandButton
              variant="outline"
              size="lg"
              onClick={() => router.push("/dashboard/agent-marketplace")}
            >
              <Store className="h-5 w-5 mr-2" />
              Browse Marketplace
            </BrandButton>
          </div>

          {/* Quick tips */}
          <div className="pt-6 border-t border-white/10">
            <p className="text-sm text-white/50 mb-3">Quick tips:</p>
            <ul className="text-sm text-white/60 space-y-2 text-left max-w-md mx-auto">
              <li className="flex items-start gap-2">
                <span className="text-[#FF5800] mt-0.5">•</span>
                <span>
                  Define personality traits, knowledge, and conversation style
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#FF5800] mt-0.5">•</span>
                <span>Test your agent in real-time chat before deployment</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#FF5800] mt-0.5">•</span>
                <span>
                  Clone and customize agents from the marketplace
                </span>
              </li>
            </ul>
          </div>
        </div>
      </BrandCard>
    </div>
  );
}

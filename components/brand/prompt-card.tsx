/**
 * Prompt Card Component
 * Interactive prompt suggestion cards used in the landing page
 */

import { cn } from "@/lib/utils";
import { ArrowUpLeft } from "lucide-react";

interface PromptCardProps {
  prompt: string;
  onClick?: () => void;
  className?: string;
}

export function PromptCard({ prompt, onClick, className }: PromptCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative bg-black/40 border border-white/10 p-6 text-left hover:border-white/30 transition-all",
        className,
      )}
    >
      <p className="text-sm text-white/70 group-hover:text-white/90 pr-10 pb-8">
        {prompt}
      </p>
      <ArrowUpLeft className="absolute bottom-4 right-4 h-6 w-6 text-[#E1E1E1]" />
    </button>
  );
}

// Grid of prompt cards
interface PromptCardGridProps {
  prompts: string[];
  onPromptClick?: (prompt: string) => void;
  className?: string;
}

export function PromptCardGrid({
  prompts,
  onPromptClick,
  className,
}: PromptCardGridProps) {
  return (
    <div
      className={cn("mt-6 grid grid-cols-1 md:grid-cols-3 gap-0", className)}
    >
      {prompts.map((prompt, index) => (
        <PromptCard
          key={index}
          prompt={prompt}
          onClick={() => onPromptClick?.(prompt)}
        />
      ))}
    </div>
  );
}

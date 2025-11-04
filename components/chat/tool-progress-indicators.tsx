"use client";

import { Puzzle, Image as ImageIcon, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface ToolProgress {
  id: string;
  name: string;
  icon?: "puzzle" | "image" | "message";
  isActive?: boolean;
}

interface ToolProgressIndicatorsProps {
  tools: ToolProgress[];
  className?: string;
}

const iconMap = {
  puzzle: Puzzle,
  image: ImageIcon,
  message: MessageSquare,
};

export function ToolProgressIndicators({
  tools,
  className,
}: ToolProgressIndicatorsProps) {
  if (tools.length === 0) return null;

  return (
    <div className={cn("flex flex-col gap-2 w-full", className)}>
      {tools.map((tool) => {
        const Icon = tool.icon ? iconMap[tool.icon] : PuzzlePiece;

        return (
          <div
            key={tool.id}
            className={cn(
              "flex items-center gap-2 w-full",
              tool.isActive ? "opacity-100" : "opacity-50"
            )}
          >
            <Icon className="h-4 w-4 text-[#ADADAD]" />
            <div className="flex-1 flex flex-col gap-2">
              <p className="text-xs font-mono text-white/60">{tool.name}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

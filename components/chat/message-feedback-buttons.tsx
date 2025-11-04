"use client";

import { ThumbsUp, ThumbsDown, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageFeedbackButtonsProps {
  onLike?: () => void;
  onDislike?: () => void;
  onRegenerate?: () => void;
  className?: string;
}

export function MessageFeedbackButtons({
  onLike,
  onDislike,
  onRegenerate,
  className,
}: MessageFeedbackButtonsProps) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {/* Like Button */}
      <button
        type="button"
        onClick={onLike}
        className="backdrop-blur-[10px] p-1.5 rounded-full hover:bg-white/10 transition-colors"
        title="Like this response"
      >
        <ThumbsUp className="h-4 w-4 text-[#e1e1e1]" />
      </button>

      {/* Dislike Button */}
      <button
        type="button"
        onClick={onDislike}
        className="backdrop-blur-[10px] p-1.5 rounded-full hover:bg-white/10 transition-colors"
        title="Dislike this response"
      >
        <ThumbsDown className="h-4 w-4 text-[#e1e1e1]" />
      </button>

      {/* Regenerate Button */}
      <button
        type="button"
        onClick={onRegenerate}
        className="backdrop-blur-[10px] p-1.5 rounded-full hover:bg-white/10 transition-colors"
        title="Regenerate response"
      >
        <RefreshCcw className="h-4 w-4 text-[#e1e1e1]" />
      </button>
    </div>
  );
}


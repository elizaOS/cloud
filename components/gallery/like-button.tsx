/**
 * Like Button Component
 *
 * Animated heart button for liking gallery projects.
 * Supports optimistic updates and shows like count.
 */
"use client";

import { useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { likeGalleryProject } from "@/app/actions/community-gallery";
import { toast } from "sonner";

interface LikeButtonProps {
  submissionId: string;
  initialLiked: boolean;
  initialCount: number;
  className?: string;
  showCount?: boolean;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  requireAuth?: boolean;
  onAuthRequired?: () => void;
}

const sizeConfig = {
  sm: {
    button: "p-1.5",
    icon: "w-3.5 h-3.5",
    text: "text-xs",
  },
  md: {
    button: "p-2",
    icon: "w-4 h-4",
    text: "text-sm",
  },
  lg: {
    button: "p-2.5",
    icon: "w-5 h-5",
    text: "text-base",
  },
};

export function LikeButton({
  submissionId,
  initialLiked,
  initialCount,
  className,
  showCount = true,
  size = "md",
  disabled = false,
  requireAuth = true,
  onAuthRequired,
}: LikeButtonProps) {
  const [isLiked, setIsLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [isPending, startTransition] = useTransition();
  const [isAnimating, setIsAnimating] = useState(false);

  const config = sizeConfig[size];

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (disabled || isPending) return;

    if (requireAuth && onAuthRequired && !initialLiked) {
      // If not logged in and clicking for first time, show auth prompt
      onAuthRequired();
      return;
    }

    // Optimistic update
    const wasLiked = isLiked;
    setIsLiked(!wasLiked);
    setCount((prev) => (wasLiked ? prev - 1 : prev + 1));

    // Trigger animation
    if (!wasLiked) {
      setIsAnimating(true);
      setTimeout(() => setIsAnimating(false), 300);
    }

    startTransition(async () => {
      try {
        const result = await likeGalleryProject(submissionId);
        // Sync with server response
        setIsLiked(result.liked);
        setCount(result.likeCount);
      } catch (error) {
        // Revert on error
        setIsLiked(wasLiked);
        setCount((prev) => (wasLiked ? prev + 1 : prev - 1));

        const message =
          error instanceof Error ? error.message : "Failed to update like";

        // Check if auth error
        if (message.includes("Unauthorized") || message.includes("Authentication")) {
          onAuthRequired?.();
        } else {
          toast.error(message);
        }
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || isPending}
      className={cn(
        "flex items-center gap-1.5 transition-all duration-200",
        "text-white/50 hover:text-white/80",
        isLiked && "text-[#FF5800] hover:text-[#FF5800]",
        disabled && "opacity-50 cursor-not-allowed",
        isPending && "opacity-70",
        config.button,
        className
      )}
      aria-label={isLiked ? "Unlike" : "Like"}
    >
      <Heart
        className={cn(
          config.icon,
          "transition-all duration-200",
          isLiked && "fill-current",
          isAnimating && "animate-icon-bounce"
        )}
      />
      {showCount && (
        <span className={cn(config.text, "tabular-nums min-w-[1ch]")}>
          {formatCount(count)}
        </span>
      )}
    </button>
  );
}

function formatCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}

/**
 * Skeleton version of the like button for loading states.
 */
export function LikeButtonSkeleton({
  size = "md",
  showCount = true,
}: {
  size?: "sm" | "md" | "lg";
  showCount?: boolean;
}) {
  const config = sizeConfig[size];

  return (
    <div className={cn("flex items-center gap-1.5", config.button)}>
      <div
        className={cn(config.icon, "bg-white/10 rounded animate-pulse")}
      />
      {showCount && (
        <div
          className={cn(
            config.text,
            "h-4 w-6 bg-white/10 rounded animate-pulse"
          )}
        />
      )}
    </div>
  );
}

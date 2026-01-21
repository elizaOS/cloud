/**
 * Milestone progress component showing progress toward withdrawal threshold.
 * Features animated progress bar and celebratory state when milestone is reached.
 */

"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, Target } from "lucide-react";

interface MilestoneProgressProps {
  current: number;
  target: number;
  label?: string;
  className?: string;
  showAmount?: boolean;
}

export function MilestoneProgress({
  current,
  target,
  label = "Withdrawal Threshold",
  className,
  showAmount = true,
}: MilestoneProgressProps) {
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const progress = Math.min((current / target) * 100, 100);
  const isComplete = current >= target;

  useEffect(() => {
    // Animate progress bar on mount
    const timeout = setTimeout(() => {
      setAnimatedProgress(progress);
    }, 100);
    return () => clearTimeout(timeout);
  }, [progress]);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-white/50 uppercase tracking-wider flex items-center gap-1.5">
          <Target className="h-3 w-3" />
          {label}
        </span>
        {showAmount && (
          <span className="text-white/70 font-mono">
            ${current.toFixed(2)} / ${target.toFixed(2)}
          </span>
        )}
      </div>

      <div className="relative h-2 bg-white/5 rounded-full overflow-hidden">
        {/* Background glow when complete */}
        {isComplete && (
          <div className="absolute inset-0 bg-green-500/20 animate-pulse" />
        )}

        {/* Progress bar */}
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full transition-all duration-1000 ease-out",
            isComplete
              ? "bg-gradient-to-r from-green-500 to-green-400"
              : "bg-gradient-to-r from-[#FF5800] to-[#FF8C00]"
          )}
          style={{ width: `${animatedProgress}%` }}
        />

        {/* Shimmer effect */}
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full overflow-hidden transition-all duration-1000 ease-out"
          )}
          style={{ width: `${animatedProgress}%` }}
        >
          <div className="absolute inset-0 animate-shimmer-premium" />
        </div>
      </div>

      {/* Status message */}
      <div className="flex items-center justify-between">
        {isComplete ? (
          <span className="text-xs text-green-400 flex items-center gap-1.5 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Ready to withdraw!
          </span>
        ) : (
          <span className="text-xs text-white/40">
            ${(target - current).toFixed(2)} more to unlock withdrawals
          </span>
        )}
        <span className="text-xs font-mono text-white/50">
          {progress.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

interface MilestoneCardProps extends MilestoneProgressProps {
  title?: string;
}

export function MilestoneCard({
  title = "Withdrawal Progress",
  ...props
}: MilestoneCardProps) {
  const isComplete = props.current >= props.target;

  return (
    <div
      className={cn(
        "relative p-4 rounded-lg border transition-all duration-500",
        isComplete
          ? "bg-green-500/5 border-green-500/30 animate-[milestoneReached_2s_ease-in-out_infinite]"
          : "bg-white/5 border-white/10"
      )}
    >
      <h4 className="text-sm font-medium text-white mb-3">{title}</h4>
      <MilestoneProgress {...props} />
    </div>
  );
}

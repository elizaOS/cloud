"use client";

import { Trophy, Flame, Star } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { calculateLevel, calculateProgress } from "@/lib/types";
import type { UserPoints } from "@/lib/types";
import { cn } from "@/lib/utils";

interface LevelBadgeProps {
  points: UserPoints;
  compact?: boolean;
}

const levelColors: Record<number, string> = {
  1: "from-gray-500 to-gray-600",
  2: "from-green-500 to-green-600",
  3: "from-blue-500 to-blue-600",
  4: "from-purple-500 to-purple-600",
  5: "from-yellow-500 to-yellow-600",
  6: "from-orange-500 to-orange-600",
  7: "from-red-500 to-red-600",
  8: "from-pink-500 to-pink-600",
  9: "from-cyan-500 to-cyan-600",
  10: "from-primary to-orange-600",
};

export function LevelBadge({ points, compact = false }: LevelBadgeProps) {
  const level = calculateLevel(points.currentPoints);
  const progress = calculateProgress(points.currentPoints);
  const colorClass = levelColors[level.level] || levelColors[1];

  if (compact) {
    return (
      <div className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-white bg-gradient-to-r", colorClass)}>
        <Trophy className="h-4 w-4" />Lv.{level.level}
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl bg-card border border-border">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br text-white", colorClass)}>
            <Trophy className="h-6 w-6" />
          </div>
          <div>
            <div className="font-semibold">Level {level.level}</div>
            <div className="text-sm text-muted-foreground">{level.name}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold">{points.currentPoints}</div>
          <div className="text-sm text-muted-foreground">points</div>
        </div>
      </div>

      {level.nextThreshold && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Progress to Level {level.level + 1}</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
          <div className="text-xs text-muted-foreground text-right">
            {level.nextThreshold - points.currentPoints} points to go
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-yellow-500" />
          <span className="text-sm"><span className="font-medium">{points.totalEarned}</span> total</span>
        </div>
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-500 streak-flame" />
          <span className="text-sm"><span className="font-medium">{points.streak}</span> day streak</span>
        </div>
      </div>
    </div>
  );
}

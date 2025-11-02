import { type LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { BrandCard } from "@/components/brand";

export interface MetricCardProps {
  label: string;
  value: string;
  description?: string;
  trend?: {
    direction: "up" | "down" | "neutral";
    label: string;
    percentage?: number;
  };
  icon?: LucideIcon;
  accent?: string;
  className?: string;
  size?: "default" | "compact";
  progress?: number;
}

const TREND_STYLES: Record<
  "up" | "down" | "neutral",
  { bg: string; text: string; icon: LucideIcon }
> = {
  up: { bg: "bg-emerald-500/20 border-emerald-500/40", text: "text-emerald-400", icon: TrendingUp },
  down: { bg: "bg-rose-500/20 border-rose-500/40", text: "text-rose-400", icon: TrendingDown },
  neutral: { bg: "bg-white/10 border-white/20", text: "text-white/60", icon: Minus },
};

export function MetricCard({
  label,
  value,
  description,
  trend,
  icon: Icon,
  accent,
  className,
  size = "default",
  progress,
}: MetricCardProps) {
  const isCompact = size === "compact";
  const TrendIcon = trend ? TREND_STYLES[trend.direction].icon : null;

  return (
    <BrandCard
      corners={false}
      className={cn(
        "group transition-all hover:border-[#FF5800]/40",
        className,
      )}
    >
      <div className={cn("space-y-0 pb-2", isCompact ? "p-4" : "p-5")}>
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">
            {label}
          </h4>
          {trend && (
            <span
              className={cn(
                "gap-1 rounded-none border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide flex items-center",
                TREND_STYLES[trend.direction].bg,
                TREND_STYLES[trend.direction].text,
              )}
            >
              {TrendIcon && <TrendIcon className="h-3 w-3" />}
              {trend.percentage !== undefined
                ? `${trend.percentage}%`
                : trend.label}
            </span>
          )}
        </div>
      </div>
      <div className={cn("space-y-3", isCompact ? "px-4 pb-4" : "px-5 pb-5")}>
        <div className="flex items-center gap-3">
          {Icon && (
            <div
              className={cn(
                "flex items-center justify-center rounded-none bg-black/60 text-white border transition-all group-hover:border-[#FF5800]/40",
                isCompact ? "h-9 w-9" : "h-11 w-11",
                accent || "border-white/10",
              )}
            >
              <Icon className={cn(isCompact ? "h-4 w-4" : "h-5 w-5", "text-[#FF5800]")} />
            </div>
          )}
          <div className="flex-1 space-y-1">
            <p className="text-2xl font-semibold leading-tight text-white">
              {value}
            </p>
            {description && (
              <p className="text-xs text-white/60">
                {description}
              </p>
            )}
          </div>
        </div>
        {progress !== undefined && (
          <div className="space-y-1">
            <Progress value={progress} className="h-1.5 bg-white/10">
              <div className="h-full bg-[#FF5800] transition-all" style={{ width: `${progress}%` }} />
            </Progress>
            <p className="text-[10px] text-white/50">
              {progress}% capacity
            </p>
          </div>
        )}
      </div>
    </BrandCard>
  );
}

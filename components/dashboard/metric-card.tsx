import { type LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

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
  up: { bg: "bg-emerald-500/12", text: "text-emerald-500", icon: TrendingUp },
  down: { bg: "bg-rose-500/12", text: "text-rose-500", icon: TrendingDown },
  neutral: { bg: "bg-muted/40", text: "text-muted-foreground", icon: Minus },
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
    <Card
      className={cn(
        "group border-border/50 bg-card/95 backdrop-blur-sm shadow-md transition-all hover:border-primary/40 hover:shadow-lg",
        className,
      )}
    >
      <CardHeader className={cn("space-y-0 pb-2", isCompact ? "p-4" : "p-5")}>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/85">
            {label}
          </CardTitle>
          {trend && (
            <Badge
              variant="secondary"
              className={cn(
                "gap-1 rounded-full border-0 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                TREND_STYLES[trend.direction].bg,
                TREND_STYLES[trend.direction].text,
              )}
            >
              {TrendIcon && <TrendIcon className="h-3 w-3" />}
              {trend.percentage !== undefined
                ? `${trend.percentage}%`
                : trend.label}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent
        className={cn("space-y-3", isCompact ? "px-4 pb-4" : "px-5 pb-5")}
      >
        <div className="flex items-center gap-3">
          {Icon && (
            <div
              className={cn(
                "flex items-center justify-center rounded-xl bg-gradient-to-br from-muted/50 via-muted/30 to-background/80 text-foreground/80 ring-1 ring-border/60 transition-all group-hover:ring-primary/40",
                isCompact ? "h-9 w-9" : "h-11 w-11",
                accent,
              )}
            >
              <Icon className={cn(isCompact ? "h-4 w-4" : "h-5 w-5")} />
            </div>
          )}
          <div className="flex-1 space-y-1">
            <p className="text-2xl font-semibold leading-tight text-foreground">
              {value}
            </p>
            {description && (
              <CardDescription className="text-xs">
                {description}
              </CardDescription>
            )}
          </div>
        </div>
        {progress !== undefined && (
          <div className="space-y-1">
            <Progress value={progress} className="h-1.5" />
            <p className="text-[10px] text-muted-foreground/70">
              {progress}% capacity
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

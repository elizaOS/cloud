import { type LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface MetricCardProps {
  label: string;
  value: string;
  description?: string;
  trend?: {
    direction: "up" | "down" | "neutral";
    label: string;
  };
  icon?: LucideIcon;
  accent?: string;
  className?: string;
  size?: "default" | "compact";
}

const TREND_STYLES: Record<"up" | "down" | "neutral", string> = {
  up: "bg-emerald-500/12 text-emerald-500",
  down: "bg-rose-500/12 text-rose-500",
  neutral: "bg-muted/40 text-muted-foreground",
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
}: MetricCardProps) {
  const paddingClass = size === "compact" ? "p-4" : "p-5";
  const iconSizeClass = size === "compact" ? "h-9 w-9" : "h-11 w-11";
  const iconInnerSize = size === "compact" ? "h-4 w-4" : "h-5 w-5";

  return (
    <Card
      className={cn("border-border/60 bg-background/85 shadow-sm", className)}
    >
      <CardContent className={cn("flex flex-col gap-3", paddingClass)}>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/85">
            {label}
          </span>
          {trend ? (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                TREND_STYLES[trend.direction],
              )}
            >
              {trend.label}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          {Icon ? (
            <span
              className={cn(
                "flex items-center justify-center rounded-xl bg-gradient-to-br from-muted/50 via-muted/30 to-background/80 text-foreground/80 ring-1 ring-border/60",
                iconSizeClass,
                accent,
              )}
            >
              <Icon className={cn(iconInnerSize)} />
            </span>
          ) : null}
          <span className="text-2xl font-semibold leading-tight text-foreground">
            {value}
          </span>
        </div>
        {description ? (
          <p className="text-xs text-muted-foreground/85">{description}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

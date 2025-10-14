import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export interface KeyMetric {
  label: string;
  value: string;
  helper?: string;
  delta?: {
    value: string;
    trend?: "up" | "down" | "neutral";
    label?: string;
  };
  icon: LucideIcon;
  accent?: "violet" | "sky" | "emerald" | "amber" | "rose";
}

interface KeyMetricsGridProps {
  metrics: KeyMetric[];
  columns?: 2 | 3 | 4;
}

const accentClasses: Record<NonNullable<KeyMetric["accent"]>, string> = {
  violet:
    "border-violet-500/40 bg-gradient-to-br from-violet-500/10 via-violet-500/5 to-transparent dark:from-violet-500/15 dark:border-violet-500/30",
  sky: "border-sky-500/40 bg-gradient-to-br from-sky-500/10 via-sky-500/5 to-transparent dark:from-sky-500/15 dark:border-sky-500/30",
  emerald:
    "border-emerald-500/40 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent dark:from-emerald-500/15 dark:border-emerald-500/30",
  amber:
    "border-amber-500/40 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent dark:from-amber-500/15 dark:border-amber-500/30",
  rose: "border-rose-500/40 bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-transparent dark:from-rose-500/15 dark:border-rose-500/30",
};

type TrendTone = "up" | "down" | "neutral";

const deltaToneClasses: Record<TrendTone, string> = {
  up: "text-emerald-600 dark:text-emerald-400",
  down: "text-rose-600 dark:text-rose-400",
  neutral: "text-muted-foreground",
};

export function KeyMetricsGrid({ metrics, columns = 4 }: KeyMetricsGridProps) {
  return (
    <div
      className={cn("grid gap-5 sm:gap-6", {
        "md:grid-cols-2 xl:grid-cols-4": columns === 4,
        "md:grid-cols-2 xl:grid-cols-3": columns === 3,
        "md:grid-cols-2": columns === 2,
      })}
    >
      {metrics.map((metric) => {
        const tone: TrendTone = metric.delta?.trend ?? "neutral";

        return (
          <Card
            key={metric.label}
            className={cn(
              "relative overflow-hidden border-border/70 bg-background/60 shadow-sm transition-colors hover:border-foreground/40",
              metric.accent ? accentClasses[metric.accent] : "",
            )}
          >
            <div className="absolute right-5 top-5 text-muted-foreground/60">
              <metric.icon className="h-5 w-5" />
            </div>
            <CardHeader className="space-y-2 p-6 pb-4">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {metric.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 p-6 pt-3">
              <div className="text-3xl font-semibold leading-tight">
                {metric.value}
              </div>
              {metric.delta ? (
                <Badge
                  variant="outline"
                  className={cn(
                    "w-fit border-transparent bg-background/60 font-medium",
                    deltaToneClasses[tone],
                  )}
                >
                  {metric.delta.value}
                  {metric.delta.label ? ` · ${metric.delta.label}` : null}
                </Badge>
              ) : null}
              {metric.helper ? (
                <p className="text-sm text-muted-foreground/80">
                  {metric.helper}
                </p>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

import { GaugeCircle, TrendingDown, TrendingUp } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface UsagePerformanceProps {
  stats: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    totalCost: number;
    totalInputTokens: number;
    totalOutputTokens: number;
  };
  dateRangeLabel?: string;
  className?: string;
}

const numberFormatter = new Intl.NumberFormat("en-US");
const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function UsagePerformance({
  stats,
  dateRangeLabel,
  className,
}: UsagePerformanceProps) {
  const {
    totalRequests,
    successfulRequests,
    failedRequests,
    totalCost,
    totalInputTokens,
    totalOutputTokens,
  } = stats;

  const successRate =
    totalRequests > 0 ? successfulRequests / totalRequests : 0;
  const failureRate = totalRequests > 0 ? failedRequests / totalRequests : 0;
  const avgTokensPerRequest =
    totalRequests > 0
      ? (totalInputTokens + totalOutputTokens) / totalRequests
      : 0;

  return (
    <Card
      className={cn("border-border/60 bg-background/85 shadow-sm", className)}
    >
      <CardHeader className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/70 bg-muted/30">
            <GaugeCircle className="h-5 w-5 text-primary" />
          </span>
          <div className="flex flex-col">
            <CardTitle className="text-sm font-semibold tracking-tight">
              Request performance
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              {dateRangeLabel ?? "Last 7 days"}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 rounded-xl border border-border/60 bg-background/95 p-4 sm:grid-cols-3">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Success rate
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-foreground">
                {percentFormatter.format(successRate)}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-500">
                <TrendingUp className="h-3 w-3" />
                {numberFormatter.format(successfulRequests)} ok
              </span>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Failure rate
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-foreground">
                {percentFormatter.format(failureRate)}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-500">
                <TrendingDown className="h-3 w-3" />
                {numberFormatter.format(failedRequests)} fail
              </span>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Avg tokens / request
            </p>
            <p className="text-2xl font-semibold text-foreground">
              {numberFormatter.format(Math.round(avgTokensPerRequest))}
            </p>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
              {numberFormatter.format(totalInputTokens)} in ·{" "}
              {numberFormatter.format(totalOutputTokens)} out
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Total requests
            </p>
            <p className="text-lg font-semibold text-foreground">
              {numberFormatter.format(totalRequests)}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Total cost (credits)
            </p>
            <p className="text-lg font-semibold text-foreground">
              {numberFormatter.format(totalCost)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

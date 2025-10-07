"use client";

import { type ReactNode } from "react";
import { CreditCard, Fuel, ShieldCheck } from "lucide-react";

import {
  MetricCard,
  type MetricCardProps,
} from "@/components/dashboard/metric-card";
import { cn } from "@/lib/utils";

const metricIconMap = {
  fuel: Fuel,
  creditCard: CreditCard,
  shieldCheck: ShieldCheck,
} as const;

export type UsageMetric = Omit<MetricCardProps, "icon"> & {
  icon?: keyof typeof metricIconMap;
};

export interface UsageOverviewProps {
  title?: string;
  description?: string;
  metrics: UsageMetric[];
  className?: string;
  footnote?: ReactNode;
}

export function UsageOverview({
  title = "Usage overview",
  description = "Monitor how your team is consuming credits and track associated costs.",
  metrics,
  className,
  footnote,
}: UsageOverviewProps) {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="space-y-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        {description ? (
          <p className="text-xs text-muted-foreground/80">{description}</p>
        ) : null}
      </div>
      <div className="flex flex-col gap-3">
        {metrics.map(({ icon, ...metric }) => (
          <MetricCard
            key={metric.label}
            {...metric}
            icon={icon ? metricIconMap[icon] : undefined}
            size="compact"
            className="h-full"
          />
        ))}
      </div>
      {footnote ? (
        <div className="rounded-xl border border-border/50 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
          {footnote}
        </div>
      ) : null}
    </section>
  );
}

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
  description = "Monitor your team's usage and track associated costs.",
  metrics,
  className,
  footnote,
}: UsageOverviewProps) {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#FF5800]" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
            {title}
          </h2>
        </div>
        {description ? (
          <p className="text-xs text-white/60">{description}</p>
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
        <div className="rounded-none border border-white/10 bg-black/40 px-4 py-3 text-xs text-white/60">
          {footnote}
        </div>
      ) : null}
    </section>
  );
}

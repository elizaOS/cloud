"use client";

import { BrandCard } from "@/components/brand";
import { Activity, Zap, Image, Video } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  subtitle: string;
  icon: LucideIcon;
  accent?: "violet" | "sky" | "emerald" | "amber" | "rose";
}

const accentClasses = {
  violet: "border-violet-500/40 hover:border-violet-500/60",
  sky: "border-sky-500/40 hover:border-sky-500/60",
  emerald: "border-emerald-500/40 hover:border-emerald-500/60",
  amber: "border-amber-500/40 hover:border-amber-500/60",
  rose: "border-rose-500/40 hover:border-rose-500/60",
};

export function StatCard({
  label,
  value,
  subtitle,
  icon: Icon,
  accent = "sky",
}: StatCardProps) {
  return (
    <BrandCard
      corners={false}
      className={cn(
        "relative overflow-hidden transition-colors",
        accentClasses[accent]
      )}
    >
      <div className="absolute right-5 top-5 text-white/20">
        <Icon className="h-6 w-6" />
      </div>
      <div className="space-y-3 p-6">
        <div className="text-xs font-medium uppercase tracking-wide text-white/50">
          {label}
        </div>
        <div className="text-3xl font-bold text-white">
          {typeof value === "number" ? value.toLocaleString() : value}
        </div>
        <div className="text-sm text-white/60">{subtitle}</div>
      </div>
    </BrandCard>
  );
}

interface StatsGridProps {
  apiRequests: number;
  apiRequestsAllTime: number;
  tokensUsed: number;
  tokensUsedAllTime: number;
  totalCost: string;
  totalCostAllTime: string;
  imagesGenerated: number;
  videosGenerated: number;
}

export function StatsGrid({
  apiRequests,
  apiRequestsAllTime,
  tokensUsed,
  tokensUsedAllTime,
  totalCost,
  totalCostAllTime,
  imagesGenerated,
  videosGenerated,
}: StatsGridProps) {
  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}k`;
    }
    return num.toLocaleString();
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="API Requests"
        value={formatNumber(apiRequests)}
        subtitle={`${formatNumber(apiRequestsAllTime)} all time`}
        icon={Activity}
        accent="sky"
      />
      <StatCard
        label="Tokens Used"
        value={formatNumber(tokensUsed)}
        subtitle={`${formatNumber(tokensUsedAllTime)} all time`}
        icon={Zap}
        accent="violet"
      />
      <StatCard
        label="Images"
        value={imagesGenerated}
        subtitle="generated all time"
        icon={Image}
        accent="emerald"
      />
      <StatCard
        label="Videos"
        value={videosGenerated}
        subtitle="generated all time"
        icon={Video}
        accent="amber"
      />
    </div>
  );
}

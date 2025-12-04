/**
 * Overview Metrics Component
 * Displays 4 key metrics: Total Generations, API Calls, Image Generations, Video Renders
 */

"use client";

import * as React from "react";
import { BrandCard } from "@/components/brand";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  Activity,
  Image as ImageIcon,
  Video,
  HelpCircle,
} from "lucide-react";

interface MetricData {
  label: string;
  value: string;
  subtitle: string;
  tooltip: string;
  icon: React.ReactNode;
  accent: string;
}

interface OverviewMetricsProps {
  totalGenerations: number;
  apiCalls24h: number;
  imageGenerations: number;
  videoRenders: number;
  showHeader?: boolean;
  className?: string;
}

export function OverviewMetrics({
  totalGenerations,
  apiCalls24h,
  imageGenerations,
  videoRenders,
  showHeader = true,
  className,
}: OverviewMetricsProps) {
  const metrics: MetricData[] = [
    {
      label: "Generations",
      value: totalGenerations.toLocaleString(),
      subtitle: `${imageGenerations} img, ${videoRenders} vid`,
      tooltip: "Total AI content created.",
      icon: <Sparkles className="h-4 w-4" />,
      accent: "from-[#FF5800]/20 to-orange-600/20 border-[#FF5800]/30",
    },
    {
      label: "API (24h)",
      value: apiCalls24h.toLocaleString(),
      subtitle: "requests",
      tooltip: "API calls in 24 hours.",
      icon: <Activity className="h-4 w-4" />,
      accent: "from-blue-500/20 to-blue-600/20 border-blue-500/30",
    },
    {
      label: "Images",
      value: imageGenerations.toLocaleString(),
      subtitle: "all time",
      tooltip: "AI-generated images.",
      icon: <ImageIcon className="h-4 w-4" />,
      accent: "from-purple-500/20 to-purple-600/20 border-purple-500/30",
    },
    {
      label: "Videos",
      value: videoRenders.toLocaleString(),
      subtitle: "all time",
      tooltip: "AI-generated videos.",
      icon: <Video className="h-4 w-4" />,
      accent: "from-green-500/20 to-green-600/20 border-green-500/30",
    },
  ];

  return (
    <div className={cn("space-y-4", className)}>
      {showHeader && (
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold text-white">Overview</h2>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="text-white/20 hover:text-white/50 transition-colors"
              >
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="right"
              className="max-w-[160px] text-xs bg-zinc-900 text-white/80 border border-white/10"
            >
              Your usage statistics.
            </TooltipContent>
          </Tooltip>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric, index) => (
        <BrandCard
          key={index}
          corners={false}
          className="group hover:border-white/20 transition-all duration-200"
        >
          <div className="flex items-start gap-3">
            {/* Icon with gradient background */}
            <div
              className={cn(
                "flex-shrink-0 inline-flex p-2 rounded-sm border bg-gradient-to-br",
                metric.accent,
              )}
            >
              {metric.icon}
            </div>

            {/* Metric Content */}
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-medium text-white/40 uppercase tracking-wide mb-0.5">
                {metric.label}
              </p>
              {/* Metric Value */}
              <p className="text-2xl font-semibold text-white tracking-tight">
                {metric.value}
              </p>
              {/* Subtitle */}
              <p className="text-[10px] text-white/40 truncate">
                {metric.subtitle}
              </p>
            </div>
          </div>
        </BrandCard>
        ))}
      </div>
    </div>
  );
}

// Skeleton loader for overview metrics
export function OverviewMetricsSkeleton() {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      {[...Array(4)].map((_, index) => (
        <BrandCard key={index} corners={false}>
          <div className="flex items-start gap-4">
            {/* Icon skeleton */}
            <div className="flex-shrink-0 inline-flex p-2.5 rounded-none border border-white/10 bg-white/5">
              <div className="h-5 w-5 bg-white/10 animate-pulse rounded" />
            </div>

            {/* Content skeleton */}
            <div className="flex-1 min-w-0">
              {/* Label skeleton */}
              <div className="h-3 w-24 bg-white/10 animate-pulse rounded mb-2" />
              {/* Value skeleton */}
              <div className="h-8 w-20 bg-white/10 animate-pulse rounded mb-2" />
              {/* Subtitle skeleton */}
              <div className="h-3 w-32 bg-white/10 animate-pulse rounded" />
            </div>
          </div>
        </BrandCard>
      ))}
    </div>
  );
}

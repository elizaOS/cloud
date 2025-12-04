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
      label: "Total Generations",
      value: totalGenerations.toLocaleString(),
      subtitle: `${imageGenerations} images, ${videoRenders} videos`,
      tooltip: "Total AI content created — images, videos, and text responses from your agents.",
      icon: <Sparkles className="h-5 w-5" />,
      accent: "from-[#FF5800]/20 to-orange-600/20 border-[#FF5800]/40",
    },
    {
      label: "API Calls (24h)",
      value: apiCalls24h.toLocaleString(),
      subtitle: "Last 24 hours",
      tooltip: "API requests made in the last 24 hours across all your agents and integrations.",
      icon: <Activity className="h-5 w-5" />,
      accent: "from-blue-500/20 to-blue-600/20 border-blue-500/40",
    },
    {
      label: "Image Generations",
      value: imageGenerations.toLocaleString(),
      subtitle: "All time",
      tooltip: "AI-generated images created by your agents using text-to-image models.",
      icon: <ImageIcon className="h-5 w-5" />,
      accent: "from-purple-500/20 to-purple-600/20 border-purple-500/40",
    },
    {
      label: "Video Renders",
      value: videoRenders.toLocaleString(),
      subtitle: "All time",
      tooltip: "AI-generated videos created by your agents using video synthesis models.",
      icon: <Video className="h-5 w-5" />,
      accent: "from-green-500/20 to-green-600/20 border-green-500/40",
    },
  ];

  return (
    <div className={cn("space-y-6", className)}>
      {showHeader && (
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold text-white">Overview</h2>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="text-white/30 hover:text-white/60 transition-colors"
              >
                <HelpCircle className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="right"
              className="max-w-[220px] bg-zinc-900 text-white/90 border border-white/10"
            >
              Your usage stats — track generations, API calls, and media created by your agents.
            </TooltipContent>
          </Tooltip>
        </div>
      )}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric, index) => (
        <BrandCard
          key={index}
          corners={false}
          className="group hover:border-white/30 transition-all duration-300"
        >
          <div className="flex items-start gap-4">
            {/* Icon with gradient background */}
            <div
              className={cn(
                "flex-shrink-0 inline-flex p-2.5 rounded-none border bg-gradient-to-br",
                metric.accent,
              )}
            >
              {metric.icon}
            </div>

            {/* Metric Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <p className="text-xs font-medium text-white/50 uppercase tracking-wide">
                  {metric.label}
                </p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="text-white/30 hover:text-white/60 transition-colors"
                    >
                      <HelpCircle className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    className="max-w-[200px] bg-zinc-900 text-white/90 border border-white/10"
                  >
                    {metric.tooltip}
                  </TooltipContent>
                </Tooltip>
              </div>
              {/* Metric Value */}
              <p className="text-3xl font-bold text-white tracking-tight mb-1">
                {metric.value}
              </p>
              {/* Subtitle */}
              <p className="text-xs text-white/60 truncate">
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

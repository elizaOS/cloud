/**
 * Overview Metrics Component
 * Displays 4 key metrics: Total Generations, API Calls, Image Generations, Video Renders
 */

import * as React from "react";
import { BrandCard } from "@/components/brand";
import { cn } from "@/lib/utils";
import { Sparkles, Activity, Image, Video } from "lucide-react";

interface MetricData {
  label: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  accent: string;
}

interface OverviewMetricsProps {
  totalGenerations: number;
  apiCalls24h: number;
  imageGenerations: number;
  videoRenders: number;
  className?: string;
}

export function OverviewMetrics({
  totalGenerations,
  apiCalls24h,
  imageGenerations,
  videoRenders,
  className,
}: OverviewMetricsProps) {
  const metrics: MetricData[] = [
    {
      label: "Total Generations",
      value: totalGenerations.toLocaleString(),
      subtitle: `${imageGenerations} images, ${videoRenders} videos`,
      icon: <Sparkles className="h-5 w-5" />,
      accent: "from-[#FF5800]/20 to-orange-600/20 border-[#FF5800]/40",
    },
    {
      label: "API Calls (24h)",
      value: apiCalls24h.toLocaleString(),
      subtitle: "o successful",
      icon: <Activity className="h-5 w-5" />,
      accent: "from-blue-500/20 to-blue-600/20 border-blue-500/40",
    },
    {
      label: "Image Generations",
      value: imageGenerations.toLocaleString(),
      subtitle: "All time",
      icon: <Image className="h-5 w-5" />,
      accent: "from-purple-500/20 to-purple-600/20 border-purple-500/40",
    },
    {
      label: "Video Renders",
      value: videoRenders.toLocaleString(),
      subtitle: "All time",
      icon: <Video className="h-5 w-5" />,
      accent: "from-green-500/20 to-green-600/20 border-green-500/40",
    },
  ];

  return (
    <div className={cn("grid gap-6 md:grid-cols-2 lg:grid-cols-4", className)}>
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
              <p className="text-xs font-medium text-white/50 uppercase tracking-wide mb-1">
                {metric.label}
              </p>
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

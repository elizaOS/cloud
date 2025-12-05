"use client";

import { BrandCard } from "@/components/brand";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";
import { ShieldCheck, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChartConfig } from "@/components/ui/chart";

interface SuccessRateCardProps {
  currentRate: number;
  history: Array<{ date: string; rate: number }>;
}

const chartConfig = {
  rate: {
    label: "Success Rate",
    color: "hsl(142, 76%, 36%)",
  },
} satisfies ChartConfig;

export function SuccessRateCard({ currentRate, history }: SuccessRateCardProps) {
  const isHealthy = currentRate >= 95;
  const avgRate = history.reduce((sum, d) => sum + d.rate, 0) / (history.length || 1);
  const trend = currentRate - avgRate;

  return (
    <BrandCard
      corners={true}
      className={cn(
        "border-emerald-500/40",
        !isHealthy && "border-rose-500/40"
      )}
    >
      <div className="p-6">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-white/50">
              <ShieldCheck className="h-4 w-4" />
              API Reliability
            </div>
            <div className="mt-1 text-sm text-white/40">Last 7 days</div>
          </div>
          <div
            className={cn(
              "rounded-none border px-2 py-1 text-xs font-bold uppercase tracking-wide",
              isHealthy
                ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-400"
                : "border-rose-500/40 bg-rose-500/20 text-rose-400"
            )}
          >
            {isHealthy ? "Healthy" : "Degraded"}
          </div>
        </div>

        {/* Success Rate Display */}
        <div className="mb-6">
          <div className="flex items-end gap-3">
            <div className="text-5xl font-bold text-white">
              {currentRate.toFixed(1)}%
            </div>
            {trend !== 0 && (
              <div
                className={cn(
                  "mb-2 flex items-center gap-1 text-sm font-semibold",
                  trend > 0 ? "text-emerald-400" : "text-rose-400"
                )}
              >
                {trend > 0 ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
                {Math.abs(trend).toFixed(1)}%
              </div>
            )}
          </div>
          <div className="mt-2 text-sm text-white/60">Success Rate</div>
        </div>

        {/* Mini Chart */}
        <ChartContainer config={chartConfig} className="h-[80px] w-full">
          <LineChart data={history}>
            <XAxis dataKey="date" hide />
            <YAxis domain={[90, 100]} hide />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => `${Number(value).toFixed(1)}%`}
                />
              }
            />
            <Line
              type="monotone"
              dataKey="rate"
              stroke={isHealthy ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)"}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ChartContainer>
      </div>
    </BrandCard>
  );
}

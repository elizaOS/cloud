"use client";

import { BrandCard } from "@/components/brand";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";
import { Activity } from "lucide-react";
import type { ChartConfig } from "@/components/ui/chart";

interface UsageMetricsChartProps {
  data: Array<{ date: string; requests: number; cost: number; tokens: number }>;
}

const chartConfig = {
  requests: {
    label: "API Requests",
    color: "hsl(217, 91%, 60%)",
  },
  tokens: {
    label: "Tokens (k)",
    color: "hsl(142, 76%, 36%)",
  },
  cost: {
    label: "Cost ($)",
    color: "hsl(262, 83%, 58%)",
  },
} satisfies ChartConfig;

export function UsageMetricsChart({ data }: UsageMetricsChartProps) {
  // Normalize data for better visualization
  const normalizedData = data.map(d => ({
    date: d.date,
    requests: d.requests,
    tokens: d.tokens / 1000, // Convert to thousands
    cost: d.cost,
  }));

  return (
    <BrandCard corners={true} className="border-sky-500/40">
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-white/50">
            <Activity className="h-4 w-4" />
            Usage Metrics
          </div>
          <div className="mt-1 text-sm text-white/40">
            API requests, tokens, and costs over time
          </div>
        </div>

        {/* Chart */}
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <LineChart data={normalizedData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
            <XAxis
              dataKey="date"
              stroke="rgba(255,255,255,0.3)"
              fontSize={12}
              tickLine={false}
            />
            <YAxis
              stroke="rgba(255,255,255,0.3)"
              fontSize={12}
              tickLine={false}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Line
              type="monotone"
              dataKey="requests"
              stroke="hsl(217, 91%, 60%)"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
            <Line
              type="monotone"
              dataKey="tokens"
              stroke="hsl(142, 76%, 36%)"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
            <Line
              type="monotone"
              dataKey="cost"
              stroke="hsl(262, 83%, 58%)"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </LineChart>
        </ChartContainer>
      </div>
    </BrandCard>
  );
}

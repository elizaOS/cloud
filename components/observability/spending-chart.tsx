"use client";

import { BrandCard } from "@/components/brand";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";
import { DollarSign } from "lucide-react";
import type { ChartConfig } from "@/components/ui/chart";

interface SpendingChartProps {
  data: Array<{ date: string; amount: number }>;
  title?: string;
  description?: string;
}

const chartConfig = {
  amount: {
    label: "Spend",
    color: "hsl(142, 76%, 36%)",
  },
} satisfies ChartConfig;

export function SpendingChart({
  data,
  title = "Daily Spending",
  description = "Last 30 days",
}: SpendingChartProps) {
  const totalSpend = data.reduce((sum, d) => sum + d.amount, 0);
  const avgSpend = data.length > 0 ? totalSpend / data.length : 0;

  return (
    <BrandCard corners={true} className="border-violet-500/40">
      <div className="p-6">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-white/50">
              <DollarSign className="h-4 w-4" />
              {title}
            </div>
            <div className="mt-1 text-sm text-white/40">{description}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-white/50">Avg per day</div>
            <div className="text-lg font-semibold text-white">
              ${avgSpend.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Chart */}
        <ChartContainer config={chartConfig} className="h-[200px] w-full">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0} />
              </linearGradient>
            </defs>
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
              tickFormatter={(value) => `$${value.toFixed(2)}`}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => `$${Number(value).toFixed(2)}`}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="amount"
              stroke="hsl(142, 76%, 36%)"
              strokeWidth={2}
              fill="url(#colorAmount)"
            />
          </AreaChart>
        </ChartContainer>
      </div>
    </BrandCard>
  );
}

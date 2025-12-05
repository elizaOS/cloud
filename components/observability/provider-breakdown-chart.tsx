"use client";

import { BrandCard } from "@/components/brand";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Database } from "lucide-react";
import type { ChartConfig } from "@/components/ui/chart";

interface ProviderBreakdownChartProps {
  data: Array<{ provider: string; cost: number; percentage: number }>;
}

const COLORS = [
  "hsl(217, 91%, 60%)",
  "hsl(142, 76%, 36%)",
  "hsl(262, 83%, 58%)",
  "hsl(31, 97%, 72%)",
  "hsl(340, 75%, 55%)",
];

export function ProviderBreakdownChart({ data }: ProviderBreakdownChartProps) {
  const chartConfig: ChartConfig = data.reduce((acc, item, index) => {
    acc[item.provider] = {
      label: item.provider,
      color: COLORS[index % COLORS.length],
    };
    return acc;
  }, {} as ChartConfig);

  const totalCost = data.reduce((sum, d) => sum + d.cost, 0);

  return (
    <BrandCard corners={true} className="border-amber-500/40">
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-white/50">
            <Database className="h-4 w-4" />
            Provider Breakdown
          </div>
          <div className="mt-1 text-sm text-white/40">
            Cost distribution by provider
          </div>
        </div>

        {/* Chart */}
        <div className="flex items-center gap-8">
          <ChartContainer config={chartConfig} className="h-[200px] w-[200px]">
            <PieChart>
              <Pie
                data={data}
                dataKey="cost"
                nameKey="provider"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={(entry) => `${entry.percentage.toFixed(0)}%`}
                labelLine={false}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => `$${Number(value).toFixed(2)}`}
                  />
                }
              />
            </PieChart>
          </ChartContainer>

          {/* Legend with costs */}
          <div className="flex-1 space-y-2">
            {data.map((item, index) => (
              <div
                key={item.provider}
                className="flex items-center justify-between border-b border-white/10 pb-2"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-sm"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="text-sm text-white/80">{item.provider}</span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-white">
                    ${item.cost.toFixed(2)}
                  </div>
                  <div className="text-xs text-white/50">
                    {item.percentage.toFixed(1)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Total */}
        <div className="mt-4 border-t border-white/10 pt-4 text-right">
          <div className="text-xs text-white/50">Total Cost</div>
          <div className="text-2xl font-bold text-white">${totalCost.toFixed(2)}</div>
        </div>
      </div>
    </BrandCard>
  );
}

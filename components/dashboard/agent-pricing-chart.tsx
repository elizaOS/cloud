"use client";

import * as React from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { format } from "date-fns";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

// Bright and vibrant color palette for different agents
const AGENT_COLORS = [
  "#FF6B6B", // Bright Red
  "#4ECDC4", // Bright Teal
  "#FFE66D", // Bright Yellow
  "#95E1D3", // Bright Mint
  "#FF8C94", // Bright Pink
  "#A8E6CF", // Bright Green
  "#FFD93D", // Bright Gold
  "#6BCF7F", // Bright Lime
  "#C7CEEA", // Bright Lavender
  "#FFDAB9", // Bright Peach
  "#87CEEB", // Bright Sky Blue
  "#FFB6C1", // Bright Light Pink
  "#98D8C8", // Bright Aqua
  "#F7DC6F", // Bright Lemon
  "#BB8FCE", // Bright Purple
];

export interface AgentPricingDataPoint {
  date: string;
  [agentName: string]: number | string;
}

export interface AgentInfo {
  id: string;
  name: string;
}

interface AgentPricingChartProps {
  data: AgentPricingDataPoint[];
  agents: AgentInfo[];
  isLoading?: boolean;
}

export function AgentPricingChart({
  data,
  agents,
  isLoading,
}: AgentPricingChartProps) {
  const [timeRange, setTimeRange] = React.useState("30d");

  // Build chart config dynamically based on agents
  const chartConfig = React.useMemo(() => {
    const config: ChartConfig = {
      cost: {
        label: "Cost",
      },
    };

    agents.forEach((agent, index) => {
      config[agent.id] = {
        label: agent.name,
        color: AGENT_COLORS[index % AGENT_COLORS.length],
      };
    });

    return config;
  }, [agents]);

  // Filter data based on time range
  const filteredData = React.useMemo(() => {
    if (!data.length) return [];

    const now = new Date();
    let daysToSubtract = 30;

    if (timeRange === "90d") {
      daysToSubtract = 90;
    } else if (timeRange === "7d") {
      daysToSubtract = 7;
    }

    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - daysToSubtract);

    return data.filter((item) => {
      const date = new Date(item.date);
      return date >= startDate;
    });
  }, [data, timeRange]);

  // Calculate total cost for the period
  const totalCost = React.useMemo(() => {
    return filteredData.reduce((total, item) => {
      agents.forEach((agent) => {
        const cost = item[agent.id];
        if (typeof cost === "number") {
          total += cost;
        }
      });
      return total;
    }, 0);
  }, [filteredData, agents]);

  if (isLoading) {
    return <AgentPricingChartSkeleton />;
  }

  if (!data.length || !agents.length) {
    return (
      <Card className="pt-0">
        <CardHeader className="flex items-center gap-2 space-y-0 border-b py-5 sm:flex-row">
          <div className="grid flex-1 gap-1">
            <CardTitle>Agent Usage Costs</CardTitle>
            <CardDescription>
              No usage data available yet. Start using your agents to see cost
              breakdown.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex h-[250px] items-center justify-center text-muted-foreground">
          <p>No data to display</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="pt-0">
      <CardHeader className="flex items-center gap-2 space-y-0 border-b py-5 sm:flex-row">
        <div className="grid flex-1 gap-1">
          <CardTitle>Agent Usage Costs</CardTitle>
          <CardDescription>
            Total: ${totalCost.toFixed(2)} over the selected period
          </CardDescription>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger
            className="hidden w-[160px] rounded-lg sm:ml-auto sm:flex"
            aria-label="Select time range"
          >
            <SelectValue placeholder="Last 30 days" />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="90d" className="rounded-lg">
              Last 3 months
            </SelectItem>
            <SelectItem value="30d" className="rounded-lg">
              Last 30 days
            </SelectItem>
            <SelectItem value="7d" className="rounded-lg">
              Last 7 days
            </SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[300px] w-full"
        >
          <AreaChart
            accessibilityLayer
            data={filteredData}
            margin={{
              left: 12,
              right: 12,
            }}
          >
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) => {
                const date = new Date(value);
                return format(date, "MMM d");
              }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={60}
              tickFormatter={(value) => `$${value.toFixed(2)}`}
              domain={[0, 'auto']}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => {
                    return format(new Date(value), "MMM d, yyyy");
                  }}
                  formatter={(value, name) => {
                    const agent = agents.find((a) => a.id === name);
                    const displayName = agent?.name || name;
                    return [`$${Number(value).toFixed(4)}`, displayName];
                  }}
                  indicator="dot"
                />
              }
            />
            <defs>
              {agents.map((agent, index) => (
                <linearGradient
                  key={agent.id}
                  id={`fill-${agent.id}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor={AGENT_COLORS[index % AGENT_COLORS.length]}
                    stopOpacity={0.9}
                  />
                  <stop
                    offset="95%"
                    stopColor={AGENT_COLORS[index % AGENT_COLORS.length]}
                    stopOpacity={0.3}
                  />
                </linearGradient>
              ))}
            </defs>
            {agents.map((agent, index) => (
              <Area
                key={agent.id}
                dataKey={agent.id}
                type="natural"
                fill={`url(#fill-${agent.id})`}
                fillOpacity={0.6}
                stroke={AGENT_COLORS[index % AGENT_COLORS.length]}
                strokeWidth={2.5}
              />
            ))}
            <ChartLegend content={<ChartLegendContent />} />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

export function AgentPricingChartSkeleton() {
  return (
    <Card className="pt-0">
      <CardHeader className="flex items-center gap-2 space-y-0 border-b py-5 sm:flex-row">
        <div className="grid flex-1 gap-1">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-60" />
        </div>
        <Skeleton className="hidden h-9 w-[160px] sm:flex" />
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <Skeleton className="h-[300px] w-full" />
      </CardContent>
    </Card>
  );
}

"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface UsageChartProps {
  data: Array<{
    timestamp: Date;
    totalRequests: number;
    totalCost: number;
    successRate: number;
  }>;
  granularity: "hour" | "day" | "week" | "month";
}

export function UsageChart({ data, granularity }: UsageChartProps) {
  const formatDate = (date: Date) => {
    const formatMap = {
      hour: "MMM d, HH:mm",
      day: "MMM d",
      week: "MMM d",
      month: "MMM yyyy",
    };
    return format(date, formatMap[granularity]);
  };

  const chartData = data.map((point) => ({
    timestamp: formatDate(point.timestamp),
    requests: point.totalRequests,
    cost: point.totalCost,
    successRate: (point.successRate * 100).toFixed(1),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Usage Over Time</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="timestamp" />
            <YAxis yAxisId="left" />
            <YAxis yAxisId="right" orientation="right" />
            <Tooltip />
            <Legend />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="requests"
              stroke="#8884d8"
              name="Requests"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="cost"
              stroke="#82ca9d"
              name="Cost (credits)"
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

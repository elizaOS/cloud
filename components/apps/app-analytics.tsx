"use client";

import { useState, useEffect } from "react";
import { BrandCard, CornerBrackets } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, TrendingUp, Users, Activity, DollarSign } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatDistanceToNow } from "date-fns";

interface AppAnalyticsProps {
  appId: string;
}

export function AppAnalytics({ appId }: AppAnalyticsProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState<"hourly" | "daily" | "monthly">("daily");
  const [analytics, setAnalytics] = useState<Array<{
    period_start: string;
    total_requests: number;
    unique_users: number;
    new_users: number;
    total_cost: string;
  }>>([]);
  const [totalStats, setTotalStats] = useState<{
    totalRequests: number;
    totalUsers: number;
    totalCreditsUsed: string;
  } | null>(null);

  const fetchAnalytics = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/v1/apps/${appId}/analytics?period=${period}`
      );
      const data = await response.json();
      
      if (data.success) {
        setAnalytics(data.analytics);
        setTotalStats(data.totalStats);
      }
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, period]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-[#FF5800]" />
      </div>
    );
  }

  // Transform analytics data for charts
  const chartData = analytics.map((item) => ({
    date: new Date(item.period_start).toLocaleDateString(),
    requests: item.total_requests,
    users: item.unique_users,
    newUsers: item.new_users,
    cost: parseFloat(item.total_cost || "0"),
  }));

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex justify-end">
        <Select value={period} onValueChange={(v: "hourly" | "daily" | "monthly") => setPeriod(v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hourly">Hourly</SelectItem>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      {totalStats && (
        <div className="grid gap-4 md:grid-cols-3">
          <BrandCard>
            <CornerBrackets size="sm" className="opacity-20" />
            <div className="relative z-10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/60">Total Requests</p>
                  <p className="text-2xl font-bold text-white mt-1">
                    {totalStats.totalRequests?.toLocaleString() || 0}
                  </p>
                </div>
                <Activity className="h-8 w-8 text-purple-500" />
              </div>
            </div>
          </BrandCard>

          <BrandCard>
            <CornerBrackets size="sm" className="opacity-20" />
            <div className="relative z-10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/60">Total Users</p>
                  <p className="text-2xl font-bold text-white mt-1">
                    {totalStats.totalUsers?.toLocaleString() || 0}
                  </p>
                </div>
                <Users className="h-8 w-8 text-blue-500" />
              </div>
            </div>
          </BrandCard>

          <BrandCard>
            <CornerBrackets size="sm" className="opacity-20" />
            <div className="relative z-10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/60">Credits Used</p>
                  <p className="text-2xl font-bold text-white mt-1">
                    ${parseFloat(totalStats.totalCreditsUsed || "0").toFixed(2)}
                  </p>
                </div>
                <DollarSign className="h-8 w-8 text-green-500" />
              </div>
            </div>
          </BrandCard>
        </div>
      )}

      {/* Requests Chart */}
      <BrandCard>
        <CornerBrackets className="opacity-20" />
        <div className="relative z-10">
          <h3 className="text-lg font-semibold text-white mb-4">
            Requests Over Time
          </h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis 
                  dataKey="date" 
                  stroke="rgba(255,255,255,0.6)"
                  style={{ fontSize: "12px" }}
                />
                <YAxis 
                  stroke="rgba(255,255,255,0.6)"
                  style={{ fontSize: "12px" }}
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: "rgba(0,0,0,0.9)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "8px",
                    color: "white",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="requests"
                  stroke="#FF5800"
                  strokeWidth={2}
                  dot={{ fill: "#FF5800" }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-white/60 py-12">No data available</p>
          )}
        </div>
      </BrandCard>

      {/* Users Chart */}
      <BrandCard>
        <CornerBrackets className="opacity-20" />
        <div className="relative z-10">
          <h3 className="text-lg font-semibold text-white mb-4">
            User Growth
          </h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis 
                  dataKey="date" 
                  stroke="rgba(255,255,255,0.6)"
                  style={{ fontSize: "12px" }}
                />
                <YAxis 
                  stroke="rgba(255,255,255,0.6)"
                  style={{ fontSize: "12px" }}
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: "rgba(0,0,0,0.9)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "8px",
                    color: "white",
                  }}
                />
                <Bar dataKey="newUsers" fill="#8b5cf6" name="New Users" />
                <Bar dataKey="users" fill="#3b82f6" name="Total Users" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-white/60 py-12">No data available</p>
          )}
        </div>
      </BrandCard>

      {/* Cost Chart */}
      <BrandCard>
        <CornerBrackets className="opacity-20" />
        <div className="relative z-10">
          <h3 className="text-lg font-semibold text-white mb-4">
            Cost Over Time
          </h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis 
                  dataKey="date" 
                  stroke="rgba(255,255,255,0.6)"
                  style={{ fontSize: "12px" }}
                />
                <YAxis 
                  stroke="rgba(255,255,255,0.6)"
                  style={{ fontSize: "12px" }}
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: "rgba(0,0,0,0.9)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "8px",
                    color: "white",
                  }}
                  formatter={(value: number) => `$${value.toFixed(2)}`}
                />
                <Line
                  type="monotone"
                  dataKey="cost"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ fill: "#10b981" }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-white/60 py-12">No data available</p>
          )}
        </div>
      </BrandCard>
    </div>
  );
}


/**
 * App analytics component displaying usage statistics and charts.
 * Supports hourly, daily, and monthly period views with request and user metrics.
 * Includes detailed request logs, top visitors, and source breakdowns.
 *
 * @param props - App analytics configuration
 * @param props.appId - App ID to fetch analytics for
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { BrandCard, CornerBrackets } from "@/components/brand";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  TrendingUp,
  Users,
  Activity,
  DollarSign,
  Globe,
  Clock,
  Monitor,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { formatDistanceToNow } from "date-fns";

interface AppAnalyticsProps {
  appId: string;
}

interface RequestLog {
  id: string;
  request_type: string;
  source: string;
  ip_address: string | null;
  user_agent: string | null;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  credits_used: string;
  response_time_ms: number | null;
  status: string;
  created_at: string;
  metadata?: {
    page_url?: string;
    referrer?: string;
    screen_width?: number;
    screen_height?: number;
    [key: string]: unknown;
  };
}

interface RequestStats {
  totalRequests: number;
  uniqueIps: number;
  uniqueUsers: number;
  byType: Record<string, number>;
  bySource: Record<string, number>;
  byStatus: Record<string, number>;
  totalCredits: string;
  avgResponseTime: number | null;
}

interface Visitor {
  ip: string;
  requestCount: number;
  lastSeen: string;
}

const SOURCE_COLORS: Record<string, string> = {
  api_key: "#FF5800",
  sandbox_preview: "#8b5cf6",
  embed: "#3b82f6",
};

const SOURCE_LABELS: Record<string, string> = {
  api_key: "API Key",
  sandbox_preview: "Sandbox Preview",
  embed: "Embedded",
};

const TYPE_COLORS: Record<string, string> = {
  pageview: "#10b981",
  chat: "#FF5800",
  image: "#8b5cf6",
  video: "#3b82f6",
  voice: "#f59e0b",
  agent: "#ec4899",
};

const TYPE_LABELS: Record<string, string> = {
  pageview: "Page View",
  chat: "Chat",
  image: "Image",
  video: "Video",
  voice: "Voice",
  agent: "Agent",
};

export function AppAnalytics({ appId }: AppAnalyticsProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState<"hourly" | "daily" | "monthly">("daily");
  const [activeTab, setActiveTab] = useState("overview");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [analytics, setAnalytics] = useState<
    Array<{
      period_start: string;
      total_requests: number;
      unique_users: number;
      new_users: number;
      total_cost: string;
    }>
  >([]);
  const [totalStats, setTotalStats] = useState<{
    totalRequests: number;
    totalUsers: number;
    totalCreditsUsed: string;
  } | null>(null);

  const [requestLogs, setRequestLogs] = useState<RequestLog[]>([]);
  const [requestStats, setRequestStats] = useState<RequestStats | null>(null);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(0);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  const LOGS_PER_PAGE = 20;
  const AUTO_REFRESH_INTERVAL = 30000;

  const fetchAnalytics = useCallback(
    async (showLoading = true) => {
      if (showLoading) setIsLoading(true);
      try {
        const response = await fetch(
          `/api/v1/apps/${appId}/analytics?period=${period}`,
        );
        const data = await response.json();

        if (data.success) {
          setAnalytics(data.analytics);
          setTotalStats(data.totalStats);
          setLastUpdated(new Date());
        }
      } catch (error) {
        console.error("Failed to fetch analytics:", error);
      } finally {
        setIsLoading(false);
      }
    },
    [appId, period],
  );

  const fetchRequestStats = useCallback(async () => {
    setIsLoadingStats(true);
    try {
      const [statsRes, visitorsRes] = await Promise.all([
        fetch(`/api/v1/apps/${appId}/analytics/requests?view=stats`),
        fetch(
          `/api/v1/apps/${appId}/analytics/requests?view=visitors&limit=10`,
        ),
      ]);

      const [statsData, visitorsData] = await Promise.all([
        statsRes.json(),
        visitorsRes.json(),
      ]);

      if (statsData.success) {
        setRequestStats(statsData.stats);
      }
      if (visitorsData.success) {
        setVisitors(visitorsData.visitors);
      }
    } catch (error) {
      console.error("Failed to fetch request stats:", error);
    } finally {
      setIsLoadingStats(false);
    }
  }, [appId]);

  const fetchRequestLogs = useCallback(
    async (page: number = 0) => {
      setIsLoadingLogs(true);
      try {
        const response = await fetch(
          `/api/v1/apps/${appId}/analytics/requests?view=logs&limit=${LOGS_PER_PAGE}&offset=${page * LOGS_PER_PAGE}`,
        );
        const data = await response.json();

        if (data.success) {
          setRequestLogs(data.requests);
          setLogsTotal(data.total);
        }
      } catch (error) {
        console.error("Failed to fetch request logs:", error);
      } finally {
        setIsLoadingLogs(false);
      }
    },
    [appId],
  );

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  useEffect(() => {
    if (activeTab === "overview") {
      const interval = setInterval(() => {
        fetchAnalytics(false);
      }, AUTO_REFRESH_INTERVAL);
      return () => clearInterval(interval);
    }
  }, [activeTab, fetchAnalytics]);

  useEffect(() => {
    if (activeTab === "requests" || activeTab === "visitors") {
      fetchRequestStats();
      const interval = setInterval(fetchRequestStats, AUTO_REFRESH_INTERVAL);
      return () => clearInterval(interval);
    }
  }, [activeTab, fetchRequestStats]);

  useEffect(() => {
    if (activeTab === "logs") {
      fetchRequestLogs(logsPage);
      const interval = setInterval(
        () => fetchRequestLogs(logsPage),
        AUTO_REFRESH_INTERVAL,
      );
      return () => clearInterval(interval);
    }
  }, [activeTab, logsPage, fetchRequestLogs]);

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

  const sourceData = requestStats
    ? Object.entries(requestStats.bySource).map(([name, value]) => ({
        name: SOURCE_LABELS[name] || name,
        value,
        color: SOURCE_COLORS[name] || "#666",
      }))
    : [];

  const totalPages = Math.ceil(logsTotal / LOGS_PER_PAGE);

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList className="bg-white/5">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="requests" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              <span className="hidden sm:inline">Requests</span>
            </TabsTrigger>
            <TabsTrigger value="visitors" className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              <span className="hidden sm:inline">Visitors</span>
            </TabsTrigger>
            <TabsTrigger value="logs" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline">Logs</span>
            </TabsTrigger>
          </TabsList>

          {activeTab === "overview" && (
            <div className="flex items-center gap-2">
              <Select
                value={period}
                onValueChange={(v: "hourly" | "daily" | "monthly") =>
                  setPeriod(v)
                }
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hourly">Hourly</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fetchAnalytics()}
                disabled={isLoading}
                title="Refresh analytics"
              >
                <RefreshCw
                  className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
                />
              </Button>
              {lastUpdated && (
                <span className="text-xs text-white/40 hidden sm:inline">
                  Updated{" "}
                  {formatDistanceToNow(lastUpdated, { addSuffix: true })}
                </span>
              )}
            </div>
          )}
        </div>

        <TabsContent value="overview" className="space-y-6">
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
                        $
                        {parseFloat(totalStats.totalCreditsUsed || "0").toFixed(
                          2,
                        )}
                      </p>
                    </div>
                    <DollarSign className="h-8 w-8 text-green-500" />
                  </div>
                </div>
              </BrandCard>
            </div>
          )}

          <BrandCard>
            <CornerBrackets className="opacity-20" />
            <div className="relative z-10">
              <h3 className="text-lg font-semibold text-white mb-4">
                Requests Over Time
              </h3>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255,255,255,0.1)"
                    />
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
                <p className="text-center text-white/60 py-12">
                  No data available
                </p>
              )}
            </div>
          </BrandCard>

          <BrandCard>
            <CornerBrackets className="opacity-20" />
            <div className="relative z-10">
              <h3 className="text-lg font-semibold text-white mb-4">
                User Growth
              </h3>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255,255,255,0.1)"
                    />
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
                <p className="text-center text-white/60 py-12">
                  No data available
                </p>
              )}
            </div>
          </BrandCard>

          <BrandCard>
            <CornerBrackets className="opacity-20" />
            <div className="relative z-10">
              <h3 className="text-lg font-semibold text-white mb-4">
                Cost Over Time
              </h3>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255,255,255,0.1)"
                    />
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
                <p className="text-center text-white/60 py-12">
                  No data available
                </p>
              )}
            </div>
          </BrandCard>
        </TabsContent>

        <TabsContent value="requests" className="space-y-6">
          {isLoadingStats ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[#FF5800]" />
            </div>
          ) : requestStats ? (
            <>
              <div className="grid gap-4 md:grid-cols-5">
                <BrandCard>
                  <CornerBrackets size="sm" className="opacity-20" />
                  <div className="relative z-10">
                    <p className="text-sm text-white/60">Page Views</p>
                    <p className="text-2xl font-bold text-[#10b981] mt-1">
                      {(requestStats.byType?.pageview || 0).toLocaleString()}
                    </p>
                  </div>
                </BrandCard>

                <BrandCard>
                  <CornerBrackets size="sm" className="opacity-20" />
                  <div className="relative z-10">
                    <p className="text-sm text-white/60">API Requests</p>
                    <p className="text-2xl font-bold text-[#FF5800] mt-1">
                      {(
                        requestStats.totalRequests -
                        (requestStats.byType?.pageview || 0)
                      ).toLocaleString()}
                    </p>
                  </div>
                </BrandCard>

                <BrandCard>
                  <CornerBrackets size="sm" className="opacity-20" />
                  <div className="relative z-10">
                    <p className="text-sm text-white/60">Unique Visitors</p>
                    <p className="text-2xl font-bold text-white mt-1">
                      {requestStats.uniqueIps.toLocaleString()}
                    </p>
                  </div>
                </BrandCard>

                <BrandCard>
                  <CornerBrackets size="sm" className="opacity-20" />
                  <div className="relative z-10">
                    <p className="text-sm text-white/60">Avg Response Time</p>
                    <p className="text-2xl font-bold text-white mt-1">
                      {requestStats.avgResponseTime
                        ? `${requestStats.avgResponseTime}ms`
                        : "N/A"}
                    </p>
                  </div>
                </BrandCard>

                <BrandCard>
                  <CornerBrackets size="sm" className="opacity-20" />
                  <div className="relative z-10">
                    <p className="text-sm text-white/60">Total Credits</p>
                    <p className="text-2xl font-bold text-white mt-1">
                      ${parseFloat(requestStats.totalCredits || "0").toFixed(4)}
                    </p>
                  </div>
                </BrandCard>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <BrandCard>
                  <CornerBrackets className="opacity-20" />
                  <div className="relative z-10">
                    <h3 className="text-lg font-semibold text-white mb-4">
                      Requests by Source
                    </h3>
                    {sourceData.length > 0 ? (
                      <div className="flex items-center gap-8">
                        <ResponsiveContainer width="50%" height={200}>
                          <PieChart>
                            <Pie
                              data={sourceData}
                              cx="50%"
                              cy="50%"
                              innerRadius={50}
                              outerRadius={80}
                              paddingAngle={2}
                              dataKey="value"
                            >
                              {sourceData.map((entry, index) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={entry.color}
                                />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "rgba(0,0,0,0.9)",
                                border: "1px solid rgba(255,255,255,0.1)",
                                borderRadius: "8px",
                                color: "white",
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="space-y-2">
                          {sourceData.map((item) => (
                            <div
                              key={item.name}
                              className="flex items-center gap-2"
                            >
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: item.color }}
                              />
                              <span className="text-sm text-white/80">
                                {item.name}: {item.value.toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-center text-white/60 py-8">
                        No data available
                      </p>
                    )}
                  </div>
                </BrandCard>

                <BrandCard>
                  <CornerBrackets className="opacity-20" />
                  <div className="relative z-10">
                    <h3 className="text-lg font-semibold text-white mb-4">
                      Requests by Type
                    </h3>
                    {Object.keys(requestStats.byType).length > 0 ? (
                      <div className="space-y-3">
                        {Object.entries(requestStats.byType).map(
                          ([type, count]) => (
                            <div
                              key={type}
                              className="flex items-center justify-between"
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className="inline-flex px-2 py-0.5 rounded text-xs"
                                  style={{
                                    backgroundColor: `${TYPE_COLORS[type] || "#666"}20`,
                                    color: TYPE_COLORS[type] || "#666",
                                  }}
                                >
                                  {TYPE_LABELS[type] || type}
                                </span>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="w-32 h-2 bg-white/10 rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full"
                                    style={{
                                      width: `${(count / requestStats.totalRequests) * 100}%`,
                                      backgroundColor:
                                        TYPE_COLORS[type] || "#FF5800",
                                    }}
                                  />
                                </div>
                                <span className="text-sm text-white/60 w-16 text-right">
                                  {count.toLocaleString()}
                                </span>
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    ) : (
                      <p className="text-center text-white/60 py-8">
                        No data available
                      </p>
                    )}
                  </div>
                </BrandCard>
              </div>

              <BrandCard>
                <CornerBrackets className="opacity-20" />
                <div className="relative z-10">
                  <h3 className="text-lg font-semibold text-white mb-4">
                    Request Status
                  </h3>
                  {Object.keys(requestStats.byStatus).length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-3">
                      {Object.entries(requestStats.byStatus).map(
                        ([status, count]) => (
                          <div
                            key={status}
                            className="bg-white/5 rounded-lg p-4 text-center"
                          >
                            <p
                              className={`text-2xl font-bold ${
                                status === "success"
                                  ? "text-green-500"
                                  : status === "failed"
                                    ? "text-red-500"
                                    : "text-yellow-500"
                              }`}
                            >
                              {count.toLocaleString()}
                            </p>
                            <p className="text-sm text-white/60 capitalize mt-1">
                              {status.replace("_", " ")}
                            </p>
                          </div>
                        ),
                      )}
                    </div>
                  ) : (
                    <p className="text-center text-white/60 py-8">
                      No data available
                    </p>
                  )}
                </div>
              </BrandCard>
            </>
          ) : (
            <p className="text-center text-white/60 py-12">
              No request data available
            </p>
          )}
        </TabsContent>

        <TabsContent value="visitors" className="space-y-6">
          {isLoadingStats ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[#FF5800]" />
            </div>
          ) : (
            <>
              {requestStats && (
                <div className="grid gap-4 md:grid-cols-3">
                  <BrandCard>
                    <CornerBrackets size="sm" className="opacity-20" />
                    <div className="relative z-10">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-white/60">Unique IPs</p>
                          <p className="text-2xl font-bold text-white mt-1">
                            {requestStats.uniqueIps.toLocaleString()}
                          </p>
                        </div>
                        <Globe className="h-8 w-8 text-[#FF5800]" />
                      </div>
                    </div>
                  </BrandCard>

                  <BrandCard>
                    <CornerBrackets size="sm" className="opacity-20" />
                    <div className="relative z-10">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-white/60">Unique Users</p>
                          <p className="text-2xl font-bold text-white mt-1">
                            {requestStats.uniqueUsers.toLocaleString()}
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
                          <p className="text-sm text-white/60">
                            Avg Requests/IP
                          </p>
                          <p className="text-2xl font-bold text-white mt-1">
                            {requestStats.uniqueIps > 0
                              ? (
                                  requestStats.totalRequests /
                                  requestStats.uniqueIps
                                ).toFixed(1)
                              : "0"}
                          </p>
                        </div>
                        <Activity className="h-8 w-8 text-purple-500" />
                      </div>
                    </div>
                  </BrandCard>
                </div>
              )}

              <BrandCard>
                <CornerBrackets className="opacity-20" />
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">
                      Top Visitors
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => fetchRequestStats()}
                      disabled={isLoadingStats}
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${isLoadingStats ? "animate-spin" : ""}`}
                      />
                    </Button>
                  </div>
                  {visitors.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/10">
                            <th className="text-left py-3 px-4 text-white/60 font-medium">
                              IP Address
                            </th>
                            <th className="text-right py-3 px-4 text-white/60 font-medium">
                              Requests
                            </th>
                            <th className="text-right py-3 px-4 text-white/60 font-medium">
                              Last Seen
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {visitors.map((visitor, index) => (
                            <tr
                              key={visitor.ip}
                              className="border-b border-white/5 hover:bg-white/5"
                            >
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  <span className="text-white/40 text-xs w-4">
                                    {index + 1}
                                  </span>
                                  <code className="text-white font-mono">
                                    {visitor.ip}
                                  </code>
                                </div>
                              </td>
                              <td className="py-3 px-4 text-right">
                                <span className="text-white font-medium">
                                  {visitor.requestCount.toLocaleString()}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right text-white/60">
                                {formatDistanceToNow(
                                  new Date(visitor.lastSeen),
                                  {
                                    addSuffix: true,
                                  },
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-center text-white/60 py-8">
                      No visitor data available
                    </p>
                  )}
                </div>
              </BrandCard>
            </>
          )}
        </TabsContent>

        <TabsContent value="logs" className="space-y-6">
          <BrandCard>
            <CornerBrackets className="opacity-20" />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">
                  Request Logs
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-white/60">
                    {logsTotal.toLocaleString()} total
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => fetchRequestLogs(logsPage)}
                    disabled={isLoadingLogs}
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${isLoadingLogs ? "animate-spin" : ""}`}
                    />
                  </Button>
                </div>
              </div>

              {isLoadingLogs ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-[#FF5800]" />
                </div>
              ) : requestLogs.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="text-left py-3 px-3 text-white/60 font-medium">
                            Time
                          </th>
                          <th className="text-left py-3 px-3 text-white/60 font-medium">
                            Type
                          </th>
                          <th className="text-left py-3 px-3 text-white/60 font-medium">
                            Source
                          </th>
                          <th className="text-left py-3 px-3 text-white/60 font-medium">
                            IP
                          </th>
                          <th className="text-left py-3 px-3 text-white/60 font-medium">
                            Details
                          </th>
                          <th className="text-center py-3 px-3 text-white/60 font-medium">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {requestLogs.map((log) => (
                          <tr
                            key={log.id}
                            className="border-b border-white/5 hover:bg-white/5"
                          >
                            <td className="py-3 px-3 text-white/60 whitespace-nowrap">
                              {formatDistanceToNow(new Date(log.created_at), {
                                addSuffix: true,
                              })}
                            </td>
                            <td className="py-3 px-3">
                              <span
                                className="inline-flex px-2 py-0.5 rounded text-xs"
                                style={{
                                  backgroundColor: `${TYPE_COLORS[log.request_type] || "#666"}20`,
                                  color:
                                    TYPE_COLORS[log.request_type] || "#666",
                                }}
                              >
                                {TYPE_LABELS[log.request_type] ||
                                  log.request_type}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <span
                                className="inline-flex px-2 py-0.5 rounded text-xs"
                                style={{
                                  backgroundColor: `${SOURCE_COLORS[log.source] || "#666"}20`,
                                  color: SOURCE_COLORS[log.source] || "#666",
                                }}
                              >
                                {SOURCE_LABELS[log.source] || log.source}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <code className="text-white/60 text-xs font-mono">
                                {log.ip_address || "N/A"}
                              </code>
                            </td>
                            <td className="py-3 px-3 text-white/60 text-xs max-w-[200px] truncate">
                              {log.request_type === "pageview" ? (
                                <span title={log.metadata?.page_url || "/"}>
                                  {log.metadata?.page_url || "/"}
                                </span>
                              ) : (
                                <span>
                                  {log.model || "N/A"}
                                  {(log.input_tokens > 0 ||
                                    log.output_tokens > 0) && (
                                    <span className="ml-2 text-white/40">
                                      (
                                      {(
                                        log.input_tokens + log.output_tokens
                                      ).toLocaleString()}{" "}
                                      tokens)
                                    </span>
                                  )}
                                  {parseFloat(log.credits_used || "0") > 0 && (
                                    <span className="ml-2 text-green-500">
                                      ${parseFloat(log.credits_used).toFixed(4)}
                                    </span>
                                  )}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-center">
                              <span
                                className={`inline-flex w-2 h-2 rounded-full ${
                                  log.status === "success"
                                    ? "bg-green-500"
                                    : log.status === "failed"
                                      ? "bg-red-500"
                                      : "bg-yellow-500"
                                }`}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-4">
                      <p className="text-sm text-white/60">
                        Page {logsPage + 1} of {totalPages}
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setLogsPage(Math.max(0, logsPage - 1))}
                          disabled={logsPage === 0 || isLoadingLogs}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setLogsPage(Math.min(totalPages - 1, logsPage + 1))
                          }
                          disabled={logsPage >= totalPages - 1 || isLoadingLogs}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-center text-white/60 py-12">
                  No request logs available yet. Logs will appear here once your
                  app receives requests.
                </p>
              )}
            </div>
          </BrandCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

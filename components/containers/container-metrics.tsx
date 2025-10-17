"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Cpu, HardDrive, Network, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ContainerMetrics {
  cpu_utilization: number;
  memory_utilization: number;
  network_rx_bytes: number;
  network_tx_bytes: number;
  task_count: number;
  healthy_task_count: number;
  timestamp: string;
}

interface ContainerMetricsProps {
  containerId: string;
  containerName: string;
}

export function ContainerMetrics({
  containerId,
  containerName,
}: ContainerMetricsProps) {
  const [metrics, setMetrics] = useState<ContainerMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchMetrics = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/v1/containers/${containerId}/metrics?period=60`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch metrics");
      }

      const data = await response.json();
      if (data.success) {
        setMetrics(data.data.metrics);
        setError(null);
      } else {
        setError(data.error || "Failed to load metrics");
      }
    } catch (err) {
      console.error("Error fetching metrics:", err);
      setError(err instanceof Error ? err.message : "Failed to load metrics");
    } finally {
      setLoading(false);
    }
  }, [containerId]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(fetchMetrics, 10000); // Refresh every 10 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh, fetchMetrics]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const getUtilizationColor = (utilization: number): string => {
    if (utilization >= 80) return "text-red-500";
    if (utilization >= 60) return "text-yellow-500";
    return "text-green-500";
  };

  const getUtilizationBadge = (utilization: number): string => {
    if (utilization >= 80) return "destructive";
    if (utilization >= 60) return "default";
    return "secondary";
  };

  if (loading && !metrics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Container Metrics</CardTitle>
          <CardDescription>Loading performance data...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Container Metrics</CardTitle>
          <CardDescription className="text-red-500">
            {error}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8 text-muted-foreground">
            <p>Metrics not available. Container may not be deployed yet.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!metrics) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Container Metrics
            </CardTitle>
            <CardDescription>
              Real-time performance metrics for {containerName}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={autoRefresh ? "default" : "outline"}
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
              title="Toggle auto-refresh"
            >
              <RefreshCw
                className={`h-4 w-4 ${autoRefresh ? "animate-spin" : ""}`}
              />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchMetrics}
              disabled={loading}
              title="Refresh metrics"
            >
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* CPU Utilization */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <Cpu className="h-5 w-5 text-muted-foreground" />
                <Badge
                  variant={
                    getUtilizationBadge(metrics.cpu_utilization) as
                      | "default"
                      | "secondary"
                      | "destructive"
                  }
                >
                  {metrics.cpu_utilization.toFixed(1)}%
                </Badge>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">CPU Usage</p>
                <p
                  className={`text-2xl font-bold ${getUtilizationColor(metrics.cpu_utilization)}`}
                >
                  {metrics.cpu_utilization.toFixed(1)}%
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Memory Utilization */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <HardDrive className="h-5 w-5 text-muted-foreground" />
                <Badge
                  variant={
                    getUtilizationBadge(metrics.memory_utilization) as
                      | "default"
                      | "secondary"
                      | "destructive"
                  }
                >
                  {metrics.memory_utilization.toFixed(1)}%
                </Badge>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Memory Usage</p>
                <p
                  className={`text-2xl font-bold ${getUtilizationColor(metrics.memory_utilization)}`}
                >
                  {metrics.memory_utilization.toFixed(1)}%
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Network In */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <Network className="h-5 w-5 text-muted-foreground" />
                <Badge variant="outline">RX</Badge>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Network In</p>
                <p className="text-2xl font-bold">
                  {formatBytes(metrics.network_rx_bytes)}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Network Out */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <Network className="h-5 w-5 text-muted-foreground" />
                <Badge variant="outline">TX</Badge>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Network Out</p>
                <p className="text-2xl font-bold">
                  {formatBytes(metrics.network_tx_bytes)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Task Status */}
        <div className="mt-4 p-4 bg-muted rounded-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Task Status:</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm">
                <span className="font-bold text-green-500">
                  {metrics.healthy_task_count}
                </span>{" "}
                / {metrics.task_count} healthy
              </span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Last updated: {new Date(metrics.timestamp).toLocaleString()}
          </p>
        </div>

        {autoRefresh && (
          <div className="flex items-center justify-center gap-2 mt-4 text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3 animate-spin" />
            Auto-refreshing every 10 seconds
          </div>
        )}
      </CardContent>
    </Card>
  );
}


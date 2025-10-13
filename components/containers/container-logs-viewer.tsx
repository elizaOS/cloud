"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Download } from "lucide-react";

interface LogEntry {
  timestamp: string;
  level: "error" | "warn" | "info" | "debug";
  message: string;
  metadata?: Record<string, unknown>;
}

interface ContainerLogsViewerProps {
  containerId: string;
  containerName: string;
}

export function ContainerLogsViewer({ containerId, containerName }: ContainerLogsViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState<string>("all");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        limit: "100",
        ...(level !== "all" && { level }),
      });

      const response = await fetch(`/api/v1/containers/${containerId}/logs?${params}`);

      if (!response.ok) {
        throw new Error("Failed to fetch logs");
      }

      const data = await response.json();
      if (data.success) {
        setLogs(data.data.logs);
        setError(null);
      } else {
        setError(data.error || "Failed to load logs");
      }
    } catch (err) {
      console.error("Error fetching logs:", err);
      setError(err instanceof Error ? err.message : "Failed to load logs");
    } finally {
      setLoading(false);
    }
  }, [containerId, level]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(fetchLogs, 5000); // Refresh every 5 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh, fetchLogs]);

  const getLevelColor = (logLevel: string) => {
    switch (logLevel) {
      case "error":
        return "text-red-500";
      case "warn":
        return "text-yellow-500";
      case "info":
        return "text-blue-500";
      case "debug":
        return "text-gray-500";
      default:
        return "text-foreground";
    }
  };

  const getLevelBadge = (logLevel: string) => {
    switch (logLevel) {
      case "error":
        return "destructive";
      case "warn":
        return "outline";
      case "info":
        return "default";
      case "debug":
        return "secondary";
      default:
        return "outline";
    }
  };

  const downloadLogs = () => {
    const logsText = logs
      .map((log) => {
        const timestamp = new Date(log.timestamp).toISOString();
        const metadata = log.metadata ? ` | ${JSON.stringify(log.metadata)}` : "";
        return `[${timestamp}] [${log.level.toUpperCase()}] ${log.message}${metadata}`;
      })
      .join("\n");

    const blob = new Blob([logsText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${containerName}-logs-${new Date().toISOString()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Container Logs</CardTitle>
            <CardDescription>
              Real-time logs from {containerName}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="error">Errors</SelectItem>
                <SelectItem value="warn">Warnings</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="debug">Debug</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              <RefreshCw className={`h-4 w-4 ${autoRefresh ? "animate-spin" : ""}`} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadLogs}
              disabled={logs.length === 0}
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading && logs.length === 0 ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-red-500">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchLogs} className="mt-4">
              Retry
            </Button>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No logs available for this container
          </div>
        ) : (
          <ScrollArea className="h-[400px] w-full rounded-md border" ref={scrollRef}>
            <div className="p-4 font-mono text-sm space-y-1">
              {logs.map((log, index) => (
                <div
                  key={`${log.timestamp}-${index}`}
                  className={`flex gap-3 p-2 hover:bg-muted/50 rounded ${getLevelColor(log.level)}`}
                >
                  <Badge variant={getLevelBadge(log.level) as "default" | "destructive" | "outline" | "secondary"} className="shrink-0 h-5">
                    {log.level.toUpperCase()}
                  </Badge>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="flex-1 break-all">{log.message}</span>
                  {log.metadata && Object.keys(log.metadata).length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {JSON.stringify(log.metadata)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
        {autoRefresh && (
          <div className="flex items-center justify-center gap-2 mt-2 text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3 animate-spin" />
            Auto-refreshing every 5 seconds
          </div>
        )}
      </CardContent>
    </Card>
  );
}


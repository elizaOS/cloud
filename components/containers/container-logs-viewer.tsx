"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCw, Download, Wifi, WifiOff, Search, Copy, Check } from "lucide-react";
import { Input } from "@/components/ui/input";

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

export function ContainerLogsViewer({
  containerId,
  containerName,
}: ContainerLogsViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [level, setLevel] = useState<string>("all");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [useStreaming, setUseStreaming] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        limit: "100",
        ...(level !== "all" && { level }),
      });

      const response = await fetch(
        `/api/v1/containers/${containerId}/logs?${params}`,
      );

      if (!response.ok) {
        throw new Error("Failed to fetch logs");
      }

      const data = await response.json();
      if (data.success) {
        setLogs(data.data.logs || []);
        setInfoMessage(data.data.message || null);
        setError(null);
      } else {
        setError(data.error || "Failed to load logs");
        setInfoMessage(null);
      }
    } catch (err) {
      console.error("Error fetching logs:", err);
      setError(err instanceof Error ? err.message : "Failed to load logs");
    } finally {
      setLoading(false);
    }
  }, [containerId, level]);

  const startStreaming = useCallback(() => {
    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const params = new URLSearchParams({
      ...(level !== "all" && { level }),
    });

    const eventSource = new EventSource(
      `/api/v1/containers/${containerId}/logs/stream?${params}`,
    );

    eventSource.onopen = () => {
      console.log("Log stream connected");
      setIsStreaming(true);
      setError(null);
    };

    eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);

        if (parsed.type === "log") {
          setLogs((prevLogs) => {
            const newLog = parsed.data;
            // Check if log already exists
            const exists = prevLogs.some(
              (log) =>
                log.timestamp === newLog.timestamp &&
                log.message === newLog.message,
            );
            if (exists) return prevLogs;

            // Add new log and keep only last 500 logs
            const updated = [newLog, ...prevLogs];
            return updated.slice(0, 500);
          });
        } else if (parsed.type === "error") {
          console.error("Stream error:", parsed.message);
          setError(parsed.message);
        }
      } catch (err) {
        console.error("Error parsing stream data:", err);
      }
    };

    eventSource.onerror = (err) => {
      console.error("EventSource error:", err);
      setIsStreaming(false);
      eventSource.close();

      // Fallback to polling
      if (useStreaming) {
        console.log("Streaming failed, falling back to polling");
        setUseStreaming(false);
        setAutoRefresh(true);
      }
    };

    eventSourceRef.current = eventSource;
  }, [containerId, level, useStreaming]);

  const stopStreaming = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  // Initial load
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Handle streaming vs polling
  useEffect(() => {
    if (autoRefresh && useStreaming) {
      // Start streaming
      startStreaming();
      return () => stopStreaming();
    } else if (autoRefresh && !useStreaming) {
      // Fallback to polling
      const interval = setInterval(fetchLogs, 5000);
      return () => clearInterval(interval);
    } else {
      // Stop streaming if auto-refresh is off
      stopStreaming();
    }
  }, [autoRefresh, useStreaming, startStreaming, stopStreaming, fetchLogs]);

  // Cleanup on unmount
  useEffect(() => {
    const abortController = abortControllerRef.current;
    return () => {
      stopStreaming();
      if (abortController) {
        abortController.abort();
      }
    };
  }, [stopStreaming]);

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
        const metadata = log.metadata
          ? ` | ${JSON.stringify(log.metadata)}`
          : "";
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

  const copyAllLogs = async () => {
    const logsText = logs
      .map((log) => {
        const timestamp = new Date(log.timestamp).toISOString();
        const metadata = log.metadata
          ? ` | ${JSON.stringify(log.metadata)}`
          : "";
        return `[${timestamp}] [${log.level.toUpperCase()}] ${log.message}${metadata}`;
      })
      .join("\n");

    await navigator.clipboard.writeText(logsText);
    toast.success("Logs copied to clipboard");
  };

  const copyLogLine = async (log: LogEntry) => {
    const timestamp = new Date(log.timestamp).toISOString();
    const metadata = log.metadata
      ? ` | ${JSON.stringify(log.metadata)}`
      : "";
    const text = `[${timestamp}] [${log.level.toUpperCase()}] ${log.message}${metadata}`;
    await navigator.clipboard.writeText(text);
    toast.success("Log line copied");
  };

  const filteredLogs = logs.filter((log) => {
    if (!searchQuery) return true;
    const searchLower = searchQuery.toLowerCase();
    return (
      log.message.toLowerCase().includes(searchLower) ||
      log.level.toLowerCase().includes(searchLower) ||
      (log.metadata &&
        JSON.stringify(log.metadata).toLowerCase().includes(searchLower))
    );
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between mb-4">
          <div>
            <CardTitle>Container Logs</CardTitle>
            <CardDescription>
              Real-time logs from {containerName}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
              title={
                autoRefresh
                  ? isStreaming
                    ? "Streaming (click to stop)"
                    : "Polling (click to stop)"
                  : "Start auto-refresh"
              }
            >
              {isStreaming ? (
                <Wifi className="h-4 w-4" />
              ) : autoRefresh ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <WifiOff className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={copyAllLogs}
              disabled={logs.length === 0}
              title="Copy all logs"
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadLogs}
              disabled={logs.length === 0}
              title="Download logs"
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Search and Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={level} onValueChange={setLevel}>
            <SelectTrigger className="w-full sm:w-[140px]">
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
        </div>

        {(searchQuery || level !== "all") && filteredLogs.length < logs.length && (
          <div className="text-sm text-muted-foreground mt-2">
            Showing {filteredLogs.length} of {logs.length} logs
          </div>
        )}
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
            <div className="mb-4">
              <p className="text-red-500 font-semibold mb-2">
                {error.includes("not been deployed")
                  ? "Container Not Yet Deployed"
                  : error.includes("not found")
                    ? "Container Logs Not Found"
                    : "Error Loading Logs"}
              </p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
            {!error.includes("not been deployed") && (
              <Button
                variant="outline"
                size="sm"
                onClick={fetchLogs}
                className="mt-4"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            )}
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-8">
            <div className="space-y-2">
              <p className="text-muted-foreground">
                {infoMessage || "No logs available for this container"}
              </p>
              {!infoMessage && (
                <p className="text-xs text-muted-foreground">
                  Logs may take a few moments to appear after deployment
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={fetchLogs}
                className="mt-4"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">
              No logs match your search criteria
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setLevel("all");
              }}
              className="mt-4"
            >
              Clear Filters
            </Button>
          </div>
        ) : (
          <ScrollArea
            className="h-[400px] w-full rounded-md border"
            ref={scrollRef}
          >
            <div className="p-4 font-mono text-sm space-y-1">
              {filteredLogs.map((log, index) => (
                <div
                  key={`${log.timestamp}-${index}`}
                  className={`group flex gap-3 p-2 hover:bg-muted/50 rounded transition-colors ${getLevelColor(log.level)}`}
                >
                  <Badge
                    variant={
                      getLevelBadge(log.level) as
                        | "default"
                        | "destructive"
                        | "outline"
                        | "secondary"
                    }
                    className="shrink-0 h-5 text-xs"
                  >
                    {log.level.toUpperCase()}
                  </Badge>
                  <span className="text-xs text-muted-foreground shrink-0 min-w-[70px]">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="flex-1 break-all whitespace-pre-wrap">
                    {log.message}
                  </span>
                  {log.metadata && Object.keys(log.metadata).length > 0 && (
                    <span className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {JSON.stringify(log.metadata)}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyLogLine(log)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0 shrink-0"
                    title="Copy log line"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
        {(autoRefresh || isStreaming) && (
          <div className="flex items-center justify-center gap-2 mt-2 text-xs text-muted-foreground">
            {isStreaming ? (
              <>
                <Wifi className="h-3 w-3 text-green-500" />
                <span className="text-green-600 dark:text-green-400">
                  Live streaming enabled
                </span>
              </>
            ) : (
              <>
                <RefreshCw className="h-3 w-3 animate-spin" />
                Auto-refreshing every 5 seconds
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

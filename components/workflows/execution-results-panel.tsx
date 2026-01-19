"use client";

import { useState, useEffect } from "react";
import {
  X,
  CheckCircle,
  XCircle,
  Loader2,
  Terminal,
  ImageIcon,
  MessageSquare,
  Zap,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  History,
} from "lucide-react";
import type {
  ExecutionResult,
  ExecutionLog,
} from "@/lib/services/workflow-executor";
import type { WorkflowRun } from "@/db/schemas";
import { getWorkflowRuns } from "@/app/actions/workflows";

interface ExecutionResultsPanelProps {
  result: ExecutionResult | null;
  isRunning: boolean;
  onClose: () => void;
  workflowId?: string;
  isScheduleActive?: boolean;
}

// Convert a WorkflowRun from DB to an ExecutionResult for display
function convertRunToResult(run: WorkflowRun): ExecutionResult {
  // node_results is an array of NodeExecutionResult
  const nodeResultsArray = run.node_results ?? [];
  const outputs: Record<string, unknown> = {};
  
  for (const nodeResult of nodeResultsArray) {
    if (nodeResult.output) {
      outputs[nodeResult.nodeId] = nodeResult.output;
    }
  }
  
  return {
    success: run.status === "success",
    workflowId: run.workflow_id,
    outputs,
    logs: [], // Logs aren't stored in DB currently
    creditsCharged: 0, // Not tracked per run currently
    totalDurationMs: run.completed_at && run.started_at 
      ? new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()
      : 0,
    error: run.error ?? undefined,
  };
}

export function ExecutionResultsPanel({
  result,
  isRunning,
  onClose,
  workflowId,
  isScheduleActive,
}: ExecutionResultsPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [isLoadingRuns, setIsLoadingRuns] = useState(false);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  // Fetch workflow runs from database
  const fetchRuns = async () => {
    if (!workflowId) return;
    setIsLoadingRuns(true);
    const fetchedRuns = await getWorkflowRuns(workflowId, 10);
    setRuns(fetchedRuns);
    setLastFetch(new Date());
    setIsLoadingRuns(false);
  };

  // Initial fetch when panel opens
  useEffect(() => {
    if (workflowId) {
      fetchRuns();
    }
  }, [workflowId]);

  // Poll for updates when schedule is active (every 15 seconds)
  useEffect(() => {
    if (!workflowId || !isScheduleActive) return;

    const interval = setInterval(() => {
      fetchRuns();
    }, 15000);

    return () => clearInterval(interval);
  }, [workflowId, isScheduleActive]);

  // Get selected run data or use manual result
  const selectedRun = selectedRunId ? runs.find((r) => r.id === selectedRunId) : null;
  const displayResult = selectedRun ? convertRunToResult(selectedRun) : result;

  // Panel always shows when mounted - parent controls visibility via showLogs state

  // Collapsed state - just show a tab button
  if (isCollapsed) {
    return (
      <button
        onClick={() => setIsCollapsed(false)}
        className="absolute top-1/2 right-0 -translate-y-1/2 z-50 flex items-center gap-2 px-3 py-4 bg-gradient-to-l from-neutral-900 to-neutral-800 border border-white/10 border-r-0 rounded-l-xl hover:bg-neutral-800 transition-colors shadow-xl"
      >
        <ChevronLeft className="w-4 h-4 text-white/60" />
        <div className="flex flex-col items-start gap-1">
          <div className="flex items-center gap-2">
            {isRunning ? (
              <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
            ) : result?.success ? (
              <CheckCircle className="w-3 h-3 text-green-400" />
            ) : (
              <XCircle className="w-3 h-3 text-red-400" />
            )}
            <span className="text-white text-xs font-medium">Execution</span>
          </div>
          {result?.logs && (
            <span className="text-white/40 text-[10px]">
              {result.logs.length} logs
            </span>
          )}
        </div>
      </button>
    );
  }

  return (
    <div className="absolute top-0 right-0 h-full w-96 bg-gradient-to-b from-neutral-900 to-black border-l border-white/10 flex flex-col z-50">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black/50 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-[#FF5800]" />
          <span className="text-white font-medium">Execution</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsCollapsed(true)}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
            title="Collapse"
          >
            <ChevronRight className="w-4 h-4 text-white/60" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
            title="Close"
          >
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>
      </div>

      {/* Status Banner - use displayResult */}
      <div className="p-4 border-b border-white/10">
        {isRunning ? (
          <div className="flex items-center gap-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl">
            <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
            <div>
              <div className="text-white font-medium">Running...</div>
              <div className="text-blue-400/80 text-xs">
                Executing workflow nodes
              </div>
            </div>
          </div>
        ) : displayResult?.success ? (
          <div className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/30 rounded-xl">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <div className="flex-1">
              <div className="text-white font-medium">Success</div>
              <div className="text-green-400/80 text-xs">
                Completed in {displayResult.totalDurationMs}ms
              </div>
            </div>
            <div className="text-right">
              <div className="text-[#FF5800] font-bold text-sm">
                {displayResult.creditsCharged}
              </div>
              <div className="text-white/40 text-xs">credits</div>
            </div>
          </div>
        ) : displayResult?.error ? (
          <div className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
            <XCircle className="w-5 h-5 text-red-400" />
            <div>
              <div className="text-white font-medium">Failed</div>
              <div className="text-red-400/80 text-xs truncate max-w-[200px]">
                {displayResult.error}
              </div>
            </div>
          </div>
        ) : runs.length > 0 ? (
          <div className="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-xl">
            <History className="w-5 h-5 text-white/40" />
            <div>
              <div className="text-white font-medium">{runs.length} Previous Runs</div>
              <div className="text-white/40 text-xs">
                Select a run below to view details
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-xl">
            <Terminal className="w-5 h-5 text-white/40" />
            <div>
              <div className="text-white font-medium">Ready</div>
              <div className="text-white/40 text-xs">
                Click &quot;Run Once&quot; to execute the workflow
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Recent Runs List */}
        {runs.length > 0 && (
          <div className="p-4 border-b border-white/10">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-white/60 text-xs font-medium uppercase tracking-wide">
                <History className="w-3 h-3" />
                Recent Runs
              </div>
              <button
                onClick={fetchRuns}
                disabled={isLoadingRuns}
                className="p-1 hover:bg-white/10 rounded transition-colors"
                title="Refresh"
              >
                <RefreshCw className={`w-3 h-3 text-white/40 ${isLoadingRuns ? "animate-spin" : ""}`} />
              </button>
            </div>
            <div className="space-y-2">
              {runs.map((run) => (
                <button
                  key={run.id}
                  onClick={() => setSelectedRunId(selectedRunId === run.id ? null : run.id)}
                  className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left ${
                    selectedRunId === run.id 
                      ? "bg-[#FF5800]/20 border border-[#FF5800]/30" 
                      : "bg-white/5 hover:bg-white/10 border border-transparent"
                  }`}
                >
                  {run.status === "success" ? (
                    <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                  ) : run.status === "error" ? (
                    <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                  ) : (
                    <Loader2 className="w-4 h-4 text-blue-400 animate-spin shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-xs font-medium">
                      {run.trigger_source === "schedule" ? "Scheduled" : run.trigger_source === "webhook" ? "Webhook" : "Manual"}
                    </div>
                    <div className="text-white/40 text-[10px]">
                      {new Date(run.created_at).toLocaleString()}
                    </div>
                  </div>
                  {run.status === "error" && run.error && (
                    <span className="text-red-400/60 text-[10px] truncate max-w-20">
                      {run.error.slice(0, 20)}...
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Error Details */}
        {displayResult?.error && (
          <div className="p-4 border-b border-white/10">
            <div className="flex items-center gap-2 text-red-400 text-xs font-medium uppercase tracking-wide mb-2">
              <XCircle className="w-3 h-3" />
              Error Details
            </div>
            <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
              <code className="text-red-300 text-sm break-words">
                {displayResult.error}
              </code>
            </div>
          </div>
        )}

        {/* Node Outputs */}
        {displayResult?.outputs && Object.keys(displayResult.outputs).length > 0 && (
          <div className="p-4 border-b border-white/10">
            <div className="flex items-center gap-2 text-white/60 text-xs font-medium uppercase tracking-wide mb-3">
              <Zap className="w-3 h-3" />
              Outputs
            </div>
            <div className="space-y-3">
              {Object.entries(displayResult.outputs).map(([nodeId, output]) => (
                <OutputCard key={nodeId} nodeId={nodeId} output={output} />
              ))}
            </div>
          </div>
        )}

        {/* Execution Logs */}
        {displayResult?.logs && displayResult.logs.length > 0 && (
          <div className="p-4">
            <div className="flex items-center gap-2 text-white/60 text-xs font-medium uppercase tracking-wide mb-3">
              <Terminal className="w-3 h-3" />
              Logs ({displayResult.logs.length})
            </div>
            <div className="bg-black/50 rounded-lg border border-white/5 overflow-hidden">
              <div className="max-h-64 overflow-y-auto p-2 space-y-1 font-mono text-xs">
                {displayResult.logs.map((log, i) => (
                  <LogEntry key={i} log={log} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LogEntry({ log }: { log: ExecutionLog }) {
  const levelConfig = {
    info: { color: "text-blue-400", bg: "bg-blue-400/10" },
    warn: { color: "text-yellow-400", bg: "bg-yellow-400/10" },
    error: { color: "text-red-400", bg: "bg-red-400/10" },
  };

  const config = levelConfig[log.level];

  return (
    <div className="flex items-start gap-2 py-1 px-2 rounded hover:bg-white/5 transition-colors">
      <span className="text-white/30 w-14 shrink-0">
        {new Date(log.timestamp).toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}
      </span>
      <span
        className={`${config.color} ${config.bg} px-1.5 py-0.5 rounded text-[10px] font-medium uppercase`}
      >
        {log.level}
      </span>
      <span className="text-[#FF5800] shrink-0">{log.nodeId}</span>
      <span className="text-white/70 break-words">{log.message}</span>
    </div>
  );
}

function OutputCard({ nodeId, output }: { nodeId: string; output: unknown }) {
  const data = output as Record<string, unknown>;
  const nodeType = data?.type as string | undefined;

  // Image output
  if (data?.imageUrl && typeof data.imageUrl === "string") {
    return (
      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border-b border-white/10">
          <ImageIcon className="w-3.5 h-3.5 text-purple-400" />
          <span className="text-white text-sm font-medium">{nodeId}</span>
          <span className="text-purple-400/60 text-xs ml-auto">image</span>
        </div>
        <div className="p-3">
          <img
            src={data.imageUrl}
            alt="Generated"
            className="rounded-lg w-full object-cover max-h-48"
          />
          {data.prompt && (
            <p className="text-white/50 text-xs mt-2 line-clamp-2">
              {String(data.prompt)}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Agent response
  if (data?.response) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border-b border-white/10">
          <MessageSquare className="w-3.5 h-3.5 text-green-400" />
          <span className="text-white text-sm font-medium">{nodeId}</span>
          <span className="text-green-400/60 text-xs ml-auto">agent</span>
        </div>
        <div className="p-3">
          <p className="text-white/80 text-sm whitespace-pre-wrap line-clamp-6">
            {String(data.response)}
          </p>
        </div>
      </div>
    );
  }

  // Trigger output
  if (nodeType === "trigger") {
    return (
      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border-b border-white/10">
          <Zap className="w-3.5 h-3.5 text-yellow-400" />
          <span className="text-white text-sm font-medium">{nodeId}</span>
          <span className="text-yellow-400/60 text-xs ml-auto">trigger</span>
        </div>
        <div className="p-3">
          <pre className="text-white/60 text-xs overflow-x-auto">
            {JSON.stringify(data.input ?? {}, null, 2)}
          </pre>
        </div>
      </div>
    );
  }

  // Default: show JSON
  const jsonOutput = JSON.stringify(output ?? {}, null, 2);
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border-b border-white/10">
        <Terminal className="w-3.5 h-3.5 text-white/40" />
        <span className="text-white text-sm font-medium">{nodeId}</span>
      </div>
      <div className="p-3">
        <pre className="text-white/50 text-xs overflow-x-auto">{String(jsonOutput)}</pre>
      </div>
    </div>
  );
}

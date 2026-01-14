"use client";

import { X, CheckCircle, XCircle, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ExecutionResult, ExecutionLog } from "@/lib/services/workflow-executor";

interface ExecutionResultsPanelProps {
  result: ExecutionResult | null;
  isRunning: boolean;
  onClose: () => void;
}

export function ExecutionResultsPanel({
  result,
  isRunning,
  onClose,
}: ExecutionResultsPanelProps) {
  if (!isRunning && !result) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 bg-black/95 border-t border-white/10 max-h-[50%] overflow-hidden flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          {isRunning ? (
            <>
              <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
              <span className="text-white font-medium">Running workflow...</span>
            </>
          ) : result?.success ? (
            <>
              <CheckCircle className="w-5 h-5 text-green-400" />
              <span className="text-white font-medium">Execution completed</span>
              <span className="text-white/60 text-sm">
                {result.totalDurationMs}ms • {result.creditsCharged} credits
              </span>
            </>
          ) : (
            <>
              <XCircle className="w-5 h-5 text-red-400" />
              <span className="text-white font-medium">Execution failed</span>
            </>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-white/10 rounded-md transition-colors"
        >
          <X className="w-5 h-5 text-white/60" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Error message */}
        {result?.error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            <div className="text-red-400 font-medium">Error</div>
            <div className="text-white/80 text-sm mt-1">{result.error}</div>
          </div>
        )}

        {/* Execution logs */}
        {result?.logs && result.logs.length > 0 && (
          <div>
            <div className="text-white/60 text-sm uppercase tracking-wide mb-2">
              Execution Log
            </div>
            <div className="bg-white/5 rounded-lg p-3 space-y-2 font-mono text-sm">
              {result.logs.map((log, i) => (
                <LogEntry key={i} log={log} />
              ))}
            </div>
          </div>
        )}

        {/* Node outputs */}
        {result?.outputs && Object.keys(result.outputs).length > 0 && (
          <div>
            <div className="text-white/60 text-sm uppercase tracking-wide mb-2">
              Node Outputs
            </div>
            <div className="space-y-3">
              {Object.entries(result.outputs).map(([nodeId, output]) => (
                <OutputCard key={nodeId} nodeId={nodeId} output={output} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LogEntry({ log }: { log: ExecutionLog }) {
  const levelColors = {
    info: "text-blue-400",
    warn: "text-yellow-400",
    error: "text-red-400",
  };

  return (
    <div className="flex gap-3">
      <span className="text-white/40 w-16 flex-shrink-0">
        {new Date(log.timestamp).toLocaleTimeString()}
      </span>
      <span className={`w-12 flex-shrink-0 ${levelColors[log.level]}`}>
        [{log.level.toUpperCase()}]
      </span>
      <span className="text-orange-400 w-24 flex-shrink-0">[{log.nodeId}]</span>
      <span className="text-white/80">{log.message}</span>
    </div>
  );
}

function OutputCard({ nodeId, output }: { nodeId: string; output: unknown }) {
  const data = output as Record<string, unknown>;

  // Check if it's an image output
  if (data?.imageUrl && typeof data.imageUrl === "string" && data.imageUrl.startsWith("http")) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-lg p-3">
        <div className="text-orange-400 text-sm font-medium mb-2">{nodeId}</div>
        <img
          src={data.imageUrl}
          alt="Generated"
          className="rounded-lg max-h-48 object-contain"
        />
        {data.prompt && (
          <div className="text-white/60 text-sm mt-2">
            Prompt: {String(data.prompt).slice(0, 100)}...
          </div>
        )}
      </div>
    );
  }

  // Check if it has a response (agent output)
  if (data?.response) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-lg p-3">
        <div className="text-orange-400 text-sm font-medium mb-2">{nodeId}</div>
        <div className="text-white/80 whitespace-pre-wrap">
          {String(data.response)}
        </div>
      </div>
    );
  }

  // Default: show JSON
  return (
    <div className="bg-white/5 border border-white/10 rounded-lg p-3">
      <div className="text-orange-400 text-sm font-medium mb-2">{nodeId}</div>
      <pre className="text-white/60 text-xs overflow-x-auto">
        {JSON.stringify(output, null, 2)}
      </pre>
    </div>
  );
}

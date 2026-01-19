"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Database, AppWindow } from "lucide-react";

interface AppQueryNodeData {
  label?: string;
  appId?: string;
  appName?: string;
  queryType?: "stats" | "users" | "requests" | "top-visitors" | "analytics";
  limit?: number;
  periodType?: "hourly" | "daily" | "monthly";
  [key: string]: unknown;
}

const QUERY_LABELS: Record<string, string> = {
  stats: "Request Stats",
  users: "App Users",
  requests: "Recent Requests",
  "top-visitors": "Top Visitors",
  analytics: "Analytics",
};

export function AppQueryNode({ selected, data }: NodeProps) {
  const nodeData = data as AppQueryNodeData;
  const label = nodeData.label ?? "App Query";
  const appName = nodeData.appName;
  const queryType = nodeData.queryType;

  return (
    <div
      className={`bg-neutral-900 border rounded-xl p-4 min-w-[180px] ${
        selected ? "border-purple-500" : "border-white/10"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-purple-500 !w-3 !h-3"
      />

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
          <Database className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <div className="text-white font-medium">{label}</div>
          <div className="text-white/40 text-xs">
            {appName ? (
              <>
                <AppWindow className="w-3 h-3 inline mr-1" />
                {appName}
                {queryType && ` · ${QUERY_LABELS[queryType]}`}
              </>
            ) : (
              "Not configured"
            )}
          </div>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-purple-500 !w-3 !h-3"
      />
    </div>
  );
}

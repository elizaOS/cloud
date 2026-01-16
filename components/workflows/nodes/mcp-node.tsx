"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Puzzle } from "lucide-react";

interface McpNodeData {
  label?: string;
  toolName?: string;
  serverName?: string;
  [key: string]: unknown;
}

export function McpNode({ selected, data }: NodeProps) {
  const nodeData = data as McpNodeData;
  const label = nodeData.label ?? nodeData.toolName ?? "MCP Tool";
  const subtitle = nodeData.serverName ?? "Call MCP Server";
  
  return (
    <div
      className={`bg-neutral-900 border rounded-xl p-4 min-w-[180px] ${
        selected ? "border-emerald-500" : "border-white/10"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-emerald-500 !w-3 !h-3"
      />

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
          <Puzzle className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <div className="text-white font-medium">{label}</div>
          <div className="text-white/40 text-xs">{subtitle}</div>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-emerald-500 !w-3 !h-3"
      />
    </div>
  );
}

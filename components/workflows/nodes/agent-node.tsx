"use client";

import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Bot } from "lucide-react";

interface AgentNodeProps {
  data: {
    label: string;
  };
}

export const AgentNode = memo(function AgentNode({ data }: AgentNodeProps) {
  return (
    <div className="bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/50 rounded-xl p-4 min-w-[180px] shadow-lg shadow-blue-500/10">
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-blue-300"
      />
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-500/20 rounded-lg">
          <Bot className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <div className="text-xs text-blue-400/80 uppercase tracking-wide font-medium">
            Agent
          </div>
          <div className="text-sm text-white font-semibold">{data.label}</div>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-blue-300"
      />
    </div>
  );
});

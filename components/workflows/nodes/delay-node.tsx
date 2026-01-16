"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Clock } from "lucide-react";

interface DelayNodeData {
  label?: string;
  [key: string]: unknown;
}

export function DelayNode({ selected, data }: NodeProps) {
  const nodeData = data as DelayNodeData;
  const label = nodeData.label ?? "Delay";
  
  return (
    <div
      className={`bg-neutral-900 border rounded-xl p-4 min-w-[180px] ${
        selected ? "border-amber-500" : "border-white/10"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-amber-500 !w-3 !h-3"
      />

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
          <Clock className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <div className="text-white font-medium">{label}</div>
          <div className="text-white/40 text-xs">Wait/Pause</div>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-amber-500 !w-3 !h-3"
      />
    </div>
  );
}

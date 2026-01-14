"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { GitBranch } from "lucide-react";

export function ConditionNode({ selected }: NodeProps) {
  return (
    <div
      className={`bg-neutral-900 border rounded-xl p-4 min-w-[180px] ${
        selected ? "border-pink-500" : "border-white/10"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-pink-500 !w-3 !h-3"
      />

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-pink-500/20 flex items-center justify-center">
          <GitBranch className="w-5 h-5 text-pink-400" />
        </div>
        <div>
          <div className="text-white font-medium">Condition</div>
          <div className="text-white/40 text-xs">If/Then Branch</div>
        </div>
      </div>

      {/* True output */}
      <Handle
        type="source"
        position={Position.Right}
        id="true"
        style={{ top: "30%" }}
        className="!bg-green-500 !w-3 !h-3"
      />
      {/* False output */}
      <Handle
        type="source"
        position={Position.Right}
        id="false"
        style={{ top: "70%" }}
        className="!bg-red-500 !w-3 !h-3"
      />
    </div>
  );
}

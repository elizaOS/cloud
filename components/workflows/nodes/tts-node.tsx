"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Volume2 } from "lucide-react";

export function TtsNode({ selected }: NodeProps) {
  return (
    <div
      className={`bg-neutral-900 border rounded-xl p-4 min-w-[180px] ${
        selected ? "border-violet-500" : "border-white/10"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-violet-500 !w-3 !h-3"
      />

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center">
          <Volume2 className="w-5 h-5 text-violet-400" />
        </div>
        <div>
          <div className="text-white font-medium">Text to Speech</div>
          <div className="text-white/40 text-xs">Generate Audio</div>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-violet-500 !w-3 !h-3"
      />
    </div>
  );
}

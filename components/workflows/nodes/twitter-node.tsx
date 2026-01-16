"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Twitter } from "lucide-react";

interface TwitterNodeData {
  label?: string;
  action?: string;
  [key: string]: unknown;
}

export function TwitterNode({ selected, data }: NodeProps) {
  const nodeData = data as TwitterNodeData;
  const label = nodeData.label ?? "Twitter";
  const action = nodeData.action ?? "post";
  
  const getActionLabel = () => {
    switch (action) {
      case "post": return "Post Tweet";
      case "reply": return "Reply";
      case "like": return "Like";
      case "retweet": return "Retweet";
      default: return "Tweet";
    }
  };

  return (
    <div
      className={`bg-neutral-900 border rounded-xl p-4 min-w-[180px] ${
        selected ? "border-sky-500" : "border-white/10"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-sky-500 !w-3 !h-3"
      />

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-sky-500/20 flex items-center justify-center">
          <Twitter className="w-5 h-5 text-sky-400" />
        </div>
        <div>
          <div className="text-white font-medium">{label}</div>
          <div className="text-white/40 text-xs">{getActionLabel()}</div>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-sky-500 !w-3 !h-3"
      />
    </div>
  );
}

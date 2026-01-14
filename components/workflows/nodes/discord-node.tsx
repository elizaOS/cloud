"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { MessageCircle } from "lucide-react";

export function DiscordNode({ selected }: NodeProps) {
  return (
    <div
      className={`bg-neutral-900 border rounded-xl p-4 min-w-[180px] ${
        selected ? "border-indigo-500" : "border-white/10"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-indigo-500 !w-3 !h-3"
      />

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center">
          <MessageCircle className="w-5 h-5 text-indigo-400" />
        </div>
        <div>
          <div className="text-white font-medium">Discord</div>
          <div className="text-white/40 text-xs">Send Message</div>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-indigo-500 !w-3 !h-3"
      />
    </div>
  );
}

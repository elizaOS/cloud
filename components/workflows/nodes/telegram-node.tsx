"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Send } from "lucide-react";

interface TelegramNodeData {
  label?: string;
  chatId?: string;
  [key: string]: unknown;
}

export function TelegramNode({ selected, data }: NodeProps) {
  const nodeData = data as TelegramNodeData;
  const label = nodeData.label ?? "Telegram";
  const chatId = nodeData.chatId;

  return (
    <div
      className={`bg-neutral-900 border rounded-xl p-4 min-w-[180px] ${
        selected ? "border-[#0088cc]" : "border-white/10"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-[#0088cc] !w-3 !h-3"
      />

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-[#0088cc]/20 flex items-center justify-center">
          <Send className="w-5 h-5 text-[#0088cc]" />
        </div>
        <div>
          <div className="text-white font-medium">{label}</div>
          <div className="text-white/40 text-xs">
            {chatId ? "Configured" : "Not configured"}
          </div>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-[#0088cc] !w-3 !h-3"
      />
    </div>
  );
}

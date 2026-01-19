"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Mail } from "lucide-react";

interface EmailNodeData {
  label?: string;
  toEmail?: string;
  [key: string]: unknown;
}

export function EmailNode({ selected, data }: NodeProps) {
  const nodeData = data as EmailNodeData;
  const label = nodeData.label ?? "Email";
  const toEmail = nodeData.toEmail;

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
          <Mail className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <div className="text-white font-medium">{label}</div>
          <div className="text-white/40 text-xs truncate max-w-[120px]">
            {toEmail ?? "Not configured"}
          </div>
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

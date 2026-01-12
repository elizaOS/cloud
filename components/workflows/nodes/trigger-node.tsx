"use client";

import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Webhook } from "lucide-react";

interface TriggerNodeProps {
  data: {
    label: string;
  };
}

export const TriggerNode = memo(function TriggerNode({
  data,
}: TriggerNodeProps) {
  return (
    <div className="bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/50 rounded-xl p-4 min-w-[180px] shadow-lg shadow-green-500/10">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-green-500/20 rounded-lg">
          <Webhook className="w-5 h-5 text-green-400" />
        </div>
        <div>
          <div className="text-xs text-green-400/80 uppercase tracking-wide font-medium">
            Trigger
          </div>
          <div className="text-sm text-white font-semibold">{data.label}</div>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-green-500 !border-2 !border-green-300"
      />
    </div>
  );
});

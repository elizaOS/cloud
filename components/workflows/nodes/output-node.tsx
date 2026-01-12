"use client";

import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { FolderOutput } from "lucide-react";

interface OutputNodeProps {
  data: {
    label: string;
  };
}

export const OutputNode = memo(function OutputNode({ data }: OutputNodeProps) {
  return (
    <div className="bg-gradient-to-br from-orange-500/20 to-amber-500/20 border border-orange-500/50 rounded-xl p-4 min-w-[180px] shadow-lg shadow-orange-500/10">
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-orange-500 !border-2 !border-orange-300"
      />
      <div className="flex items-center gap-3">
        <div className="p-2 bg-orange-500/20 rounded-lg">
          <FolderOutput className="w-5 h-5 text-orange-400" />
        </div>
        <div>
          <div className="text-xs text-orange-400/80 uppercase tracking-wide font-medium">
            Output
          </div>
          <div className="text-sm text-white font-semibold">{data.label}</div>
        </div>
      </div>
    </div>
  );
});

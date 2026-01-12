"use client";

import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { ImageIcon } from "lucide-react";

interface ImageNodeProps {
  data: {
    label: string;
  };
}

export const ImageNode = memo(function ImageNode({ data }: ImageNodeProps) {
  return (
    <div className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/50 rounded-xl p-4 min-w-[180px] shadow-lg shadow-purple-500/10">
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-purple-500 !border-2 !border-purple-300"
      />
      <div className="flex items-center gap-3">
        <div className="p-2 bg-purple-500/20 rounded-lg">
          <ImageIcon className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <div className="text-xs text-purple-400/80 uppercase tracking-wide font-medium">
            Image
          </div>
          <div className="text-sm text-white font-semibold">{data.label}</div>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-purple-500 !border-2 !border-purple-300"
      />
    </div>
  );
});

"use client";

import { HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface FieldLabelProps {
  label: string;
  jsonKey: string;
  tooltip?: string;
}

export function FieldLabel({ label, jsonKey, tooltip }: FieldLabelProps) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">
        {label}
      </span>
      <code className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-[#FF5800]/80 font-mono">
        {jsonKey}
      </code>
      {tooltip && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <HelpCircle className="h-3 w-3 text-white/30 hover:text-white/50 transition-colors" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p>{tooltip}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}


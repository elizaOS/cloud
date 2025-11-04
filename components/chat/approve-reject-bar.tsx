"use client";

import { cn } from "@/lib/utils";

interface ApproveRejectBarProps {
  agentStatus?: string;
  onApprove?: () => void;
  onReject?: () => void;
  className?: string;
}

export function ApproveRejectBar({
  agentStatus = "Agent Running ...",
  onApprove,
  onReject,
  className,
}: ApproveRejectBarProps) {
  return (
    <div
      className={cn(
        "bg-[rgba(255,255,255,0.04)] flex items-center justify-between px-2 py-1.5",
        className
      )}
    >
      <p className="text-[10px] font-mono font-medium text-[#454547]">
        {agentStatus}
      </p>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onReject}
          className="px-2 py-0.5 rounded hover:bg-white/5 transition-colors"
        >
          <p className="text-[10px] font-mono font-medium text-[#454547]">
            Reject
          </p>
        </button>

        <button
          type="button"
          onClick={onApprove}
          className="bg-[#2e2e2e] px-2 py-0.5 hover:bg-[#3e3e3e] transition-colors"
        >
          <p className="text-[10px] font-mono font-medium text-white">
            Approve
          </p>
        </button>
      </div>
    </div>
  );
}

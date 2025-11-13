"use client";

import { PlusCircle } from "lucide-react";

interface EmptyStateProps {
  onCreateNew: () => void;
}

export function EmptyState({ onCreateNew }: EmptyStateProps) {
  return (
    <div className="flex items-center justify-center min-h-[300px] w-full">
      <div
        className="bg-[#161616] flex flex-col gap-[8px] items-center justify-center p-[16px] w-full h-[300px] cursor-pointer hover:bg-[#1a1a1a] transition-colors"
        onClick={onCreateNew}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onCreateNew();
          }
        }}
        aria-label="Create New Agent"
      >
        {/* Plus Icon - 48x48px */}
        <div className="w-[48px] h-[48px] flex items-center justify-center shrink-0">
          <PlusCircle
            className="w-[48px] h-[48px] text-[#e1e1e1]"
            strokeWidth={1.5}
          />
        </div>

        {/* Text Content - gap-[8px] */}
        <div className="flex flex-col gap-[8px] items-center w-full shrink-0">
          <p
            className="font-['Roboto_Mono'] font-medium text-[#e1e1e1] text-[20px] leading-normal text-center shrink-0"
            style={{ fontFamily: "'Roboto Mono', monospace" }}
          >
            Create New Agent
          </p>
          <p
            className="font-['Roboto_Flex'] font-normal text-[#727272] text-[14px] leading-[18px] text-center w-[272px] shrink-0"
            style={{
              fontFamily: "'Roboto Flex', sans-serif",
              fontVariationSettings:
                "'GRAD' 0, 'XOPQ' 96, 'XTRA' 468, 'YOPQ' 79, 'YTAS' 750, 'YTDE' -203, 'YTFI' 738, 'YTLC' 514, 'YTUC' 712, 'wdth' 100",
            }}
          >
            ElizaOS Cloud is your complete AI agent development platform.
          </p>
        </div>
      </div>
    </div>
  );
}

"use client";

import { Loader2, Search, Sparkles, PlusCircle } from "lucide-react";

interface EmptyStatesProps {
  type: "loading" | "no-results" | "error";
  message?: string;
}

export function EmptyStates({ type, message }: EmptyStatesProps) {
  if (type === "loading") {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading characters...</p>
      </div>
    );
  }

  if (type === "no-results") {
    return (
      <div className="flex items-center justify-center min-h-[300px] w-full">
        <div 
          className="bg-[#161616] flex flex-col gap-[8px] items-center justify-center p-[16px] w-full h-[300px] cursor-pointer hover:bg-[#1a1a1a] transition-colors"
          onClick={() => {
            window.location.href = "/dashboard/character-creator";
          }}
        >
          {/* Plus Icon - 48x48px */}
          <div className="w-[48px] h-[48px] flex items-center justify-center shrink-0">
            <PlusCircle className="w-[48px] h-[48px] text-[#e1e1e1]" strokeWidth={1.5} />
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
                fontVariationSettings: "'GRAD' 0, 'XOPQ' 96, 'XTRA' 468, 'YOPQ' 79, 'YTAS' 750, 'YTDE' -203, 'YTFI' 738, 'YTLC' 514, 'YTUC' 712, 'wdth' 100"
              }}
            >
              ElizaOS Cloud is your complete AI agent development platform.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (type === "error") {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4 p-8 text-center">
        <div className="rounded-full bg-destructive/10 p-6">
          <Sparkles className="h-12 w-12 text-destructive" />
        </div>
        <div className="space-y-2">
          <h3 className="font-semibold text-lg">Something went wrong</h3>
          <p className="text-muted-foreground max-w-sm">
            {message ||
              "We couldn't load the characters. Please try again later."}
          </p>
        </div>
      </div>
    );
  }

  return null;
}

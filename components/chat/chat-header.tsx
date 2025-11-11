"use client";

import { AgentSwitcher } from "./agent-switcher";
import { ModeToggle } from "./mode-toggle";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export function ChatHeader() {
  const router = useRouter();

  return (
    <div className="h-16 border-b border-[#3e3e43] bg-[#0a0a0a] flex items-center justify-between px-6">
      {/* Left: Back + Agent Switcher */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push("/dashboard/my-agents")}
          className="flex items-center gap-2 text-[#dfdfdf] hover:text-white transition-colors"
        >
          <ArrowLeft className="w-[18px] h-[18px]" />
          <span 
            className="font-['Roboto_Mono'] font-medium text-[16px] leading-normal"
            style={{ fontFamily: "'Roboto Mono', monospace" }}
          >
            Back
          </span>
        </button>
        <div className="w-px h-6 bg-[#3e3e43]" />
        <AgentSwitcher />
      </div>

      {/* Right: Mode Toggle */}
      <div>
        <ModeToggle />
      </div>
    </div>
  );
}


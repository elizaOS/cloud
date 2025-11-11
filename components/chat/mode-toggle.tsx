"use client";

import { MessageSquare, Code2 } from "lucide-react";
import { useModeStore } from "@/stores/mode-store";
import { useRouter, useSearchParams } from "next/navigation";

export function ModeToggle() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mode, setMode } = useModeStore();
  
  const characterId = searchParams.get("characterId");

  const handleModeChange = (newMode: "chat" | "build") => {
    setMode(newMode);
    const params = new URLSearchParams(searchParams.toString());
    params.set("mode", newMode);
    router.push(`/dashboard/chat?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-0">
      {/* Chat Mode Button */}
      <button
        onClick={() => handleModeChange("chat")}
        className={`
          flex items-center gap-2 px-3 py-2 border border-[#3e3e43] transition-colors
          ${mode === "chat" 
            ? "bg-transparent text-white border-[#3e3e43]" 
            : "bg-transparent text-[#858585] hover:text-white border-[#3e3e43]"
          }
        `}
      >
        <MessageSquare className="w-4 h-4" />
        <span 
          className="font-['Roboto_Mono'] font-medium text-[14px] leading-normal"
          style={{ fontFamily: "'Roboto Mono', monospace" }}
        >
          Chat Mode
        </span>
      </button>

      {/* Build Mode Button */}
      <button
        onClick={() => handleModeChange("build")}
        className={`
          flex items-center gap-2 px-3 py-2 border border-[#3e3e43] border-l-0 transition-colors
          ${mode === "build" 
            ? "bg-[rgba(255,88,0,0.25)] text-[#ff5800] border-[#ff5800]" 
            : "bg-transparent text-[#858585] hover:text-white border-[#3e3e43]"
          }
        `}
      >
        <Code2 className="w-4 h-4" />
        <span 
          className="font-['Roboto_Mono'] font-medium text-[14px] leading-normal"
          style={{ fontFamily: "'Roboto Mono', monospace" }}
        >
          Build Mode
        </span>
      </button>
    </div>
  );
}


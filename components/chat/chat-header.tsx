"use client";

import { Settings, MoreHorizontal } from "lucide-react";
import Image from "next/image";

interface ChatHeaderProps {
  agentName: string;
  agentSubtitle?: string;
  agentAvatar?: string;
  isOnline?: boolean;
  onSettingsClick?: () => void;
  onMenuClick?: () => void;
}

export function ChatHeader({
  agentName,
  agentSubtitle,
  agentAvatar,
  isOnline = false,
  onSettingsClick,
  onMenuClick,
}: ChatHeaderProps) {
  return (
    <div className="bg-neutral-950 border-b border-[rgba(232,232,232,0.23)] px-32 py-4 flex items-center justify-between">
      {/* Left: Agent Info */}
      <div className="flex items-center gap-4">
        {/* Agent Avatar */}
        <div className="relative">
          <div className="w-12 h-12 rounded-full overflow-hidden">
            {agentAvatar ? (
              <Image
                src={agentAvatar}
                alt={agentName}
                width={48}
                height={48}
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full bg-[#FF5800] flex items-center justify-center">
                <span className="text-white text-lg font-bold">
                  {agentName.charAt(0)}
                </span>
              </div>
            )}
          </div>
          {/* Online Indicator */}
          {isOnline && (
            <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 border-2 border-neutral-950 rounded-full" />
          )}
        </div>

        {/* Agent Text Info */}
        <div className="flex flex-col gap-0.5 h-16 justify-center">
          <p className="text-base font-mono font-medium text-white tracking-tight">
            {agentName}
          </p>
          {agentSubtitle && (
            <p className="text-sm font-mono text-[#a1a1a1] tracking-tight">
              {agentSubtitle}
            </p>
          )}
        </div>
      </div>

      {/* Right: Action Buttons */}
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onSettingsClick}
          className="bg-[rgba(255,255,255,0.1)] w-8 h-8 flex items-center justify-center hover:bg-[rgba(255,255,255,0.15)] transition-colors"
          title="Settings"
        >
          <Settings className="h-4 w-4 text-white" />
        </button>

        <button
          type="button"
          onClick={onMenuClick}
          className="bg-[rgba(255,255,255,0.1)] w-8 h-8 flex items-center justify-center hover:bg-[rgba(255,255,255,0.15)] transition-colors"
          title="More options"
        >
          <MoreHorizontal className="h-[21px] w-[21px] text-white" />
        </button>
      </div>
    </div>
  );
}


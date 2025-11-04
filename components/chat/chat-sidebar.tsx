"use client";

import { ArrowLeft, Search, Edit } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface ConversationItem {
  id: string;
  title: string;
  icon?: React.ReactNode;
  isActive?: boolean;
}

interface ChatSidebarProps {
  agentName: string;
  agentAvatar?: string;
  interactionCount: number;
  conversations: ConversationItem[];
  onBackToAgents?: () => void;
  onSearchConversations?: () => void;
  onEditAgent?: () => void;
  onSelectConversation?: (id: string) => void;
}

export function ChatSidebar({
  agentName,
  agentAvatar,
  interactionCount,
  conversations,
  onBackToAgents,
  onSearchConversations,
  onEditAgent,
  onSelectConversation,
}: ChatSidebarProps) {
  return (
    <div className="bg-neutral-950 border-r border-[#3e3e43] w-[255px] h-full flex flex-col">
      {/* Header - All Agents Button */}
      <div className="border-b border-[rgba(232,232,232,0.23)] p-6 flex items-center gap-2">
        <button
          type="button"
          onClick={onBackToAgents}
          className="hover:opacity-80 transition-opacity"
        >
          <ArrowLeft className="h-[18px] w-[18px] text-[#dfdfdf]" />
        </button>
        <p className="flex-1 text-base font-mono font-medium text-[#dfdfdf] tracking-tight">
          All Agents
        </p>
      </div>

      {/* Current Agent Card */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center justify-between rounded-md w-full">
          <div className="flex items-center gap-2">
            {/* Agent Avatar */}
            <div className="relative w-6 h-6 rounded-full overflow-hidden">
              {agentAvatar ? (
                <Image
                  src={agentAvatar}
                  alt={agentName}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full bg-[#FF5800] flex items-center justify-center">
                  <span className="text-white text-xs font-bold">
                    {agentName.charAt(0)}
                  </span>
                </div>
              )}
            </div>

            {/* Agent Info */}
            <div className="flex flex-col">
              <p className="text-sm font-mono font-medium text-[#dfdfdf] tracking-tight">
                {agentName}
              </p>
              <p className="text-[10px] font-mono font-medium text-[#a1a1a1] opacity-50">
                {interactionCount} Interactions
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSearchConversations}
              className="hover:opacity-80 transition-opacity"
              title="Search conversations"
            >
              <Search className="h-[14px] w-[14px] text-[#dfdfdf]" />
            </button>
            <button
              type="button"
              onClick={onEditAgent}
              className="hover:opacity-80 transition-opacity"
              title="Edit agent"
            >
              <Edit className="h-[14px] w-[14px] text-white" />
            </button>
          </div>
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 px-6 space-y-2 overflow-y-auto">
        {conversations.map((conversation) => (
          <button
            key={conversation.id}
            type="button"
            onClick={() => onSelectConversation?.(conversation.id)}
            className={cn(
              "w-full flex items-center gap-2 px-2 py-2 rounded-lg transition-colors text-left",
              conversation.isActive
                ? "bg-neutral-900"
                : "hover:bg-neutral-900/50"
            )}
          >
            {conversation.icon && (
              <div className="flex-shrink-0">{conversation.icon}</div>
            )}
            <p className="text-sm font-mono text-[#a1a1a1] tracking-tight line-clamp-1">
              {conversation.title}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}


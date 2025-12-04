"use client";

import { BrandButton } from "@/components/brand";
import { ElizaAvatar } from "@/components/chat/eliza-avatar";
import { MessageSquare, Sparkles, Loader2 } from "lucide-react";
import { useChatStore } from "@/stores/chat-store";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface EmptyChatStateProps {
  agentName?: string;
  agentAvatar?: string;
  selectedCharacterId?: string | null;
}

export function EmptyChatState({
  agentName,
  agentAvatar,
  selectedCharacterId,
}: EmptyChatStateProps) {
  const router = useRouter();
  const { createRoom, setRoomId } = useChatStore();
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateChat = async () => {
    if (isCreating) return; // Prevent double-clicks

    setIsCreating(true);
    try {
      const newRoomId = await createRoom(selectedCharacterId);
      if (newRoomId) {
        setRoomId(newRoomId);
        const params = new URLSearchParams();
        params.set("roomId", newRoomId);
        if (selectedCharacterId) {
          params.set("characterId", selectedCharacterId);
        }
        router.push(`/dashboard/chat?${params.toString()}`);
      }
    } catch (error) {
      console.error("[EmptyChatState] Failed to create chat:", error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-12 px-4">
      {/* Agent Avatar with animation */}
      <ElizaAvatar
        avatarUrl={agentAvatar}
        name={agentName}
        className="h-16 w-16 mb-4 shadow-lg shadow-[#FF5800]/20"
        animate={true}
        iconClassName="h-8 w-8"
      />

      {/* Heading */}
      <h2 className="text-lg font-medium text-white mb-1">
        New conversation
      </h2>

      {/* Description */}
      <p className="text-xs text-white/50 max-w-xs mb-6">
        Chat with {agentName || "Eliza"}
      </p>

      {/* Primary CTA Button */}
      <BrandButton
        onClick={handleCreateChat}
        disabled={isCreating}
        size="sm"
        className="gap-1.5 h-9 text-sm"
      >
        {isCreating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Creating...
          </>
        ) : (
          <>
            <MessageSquare className="h-4 w-4" />
            Start Chat
          </>
        )}
      </BrandButton>

      {/* Helper text */}
      <p className="mt-6 text-[10px] text-white/30">
        Previous chats in sidebar
      </p>
    </div>
  );
}

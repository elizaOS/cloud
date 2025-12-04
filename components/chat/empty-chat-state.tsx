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
    <div className="flex flex-col items-center justify-center h-full text-center py-16 px-4">
      {/* Agent Avatar with animation */}
      <ElizaAvatar
        avatarUrl={agentAvatar}
        name={agentName}
        className="h-20 w-20 mb-6 shadow-lg shadow-[#FF5800]/20"
        animate={true}
        iconClassName="h-10 w-10"
      />

      {/* Heading */}
      <h2 className="text-2xl font-semibold text-white mb-3">
        Start a new conversation
      </h2>
    </div>
  );
}

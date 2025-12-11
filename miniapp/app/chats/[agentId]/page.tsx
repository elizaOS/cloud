"use client";

import { Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { createChat, listChats } from "@/lib/cloud-api";
import { useAuth } from "@/lib/use-auth";

/**
 * Agent chat redirect page
 * Automatically redirects to the most recent chat, or creates one if none exist
 */
export default function AgentChatsPage() {
  const router = useRouter();
  const params = useParams();
  const agentId = params.agentId as string;
  const { ready, authenticated } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const isCreatingRef = useRef(false);

  // Redirect to home if not authenticated
  useEffect(() => {
    if (ready && !authenticated) {
      router.push("/");
    }
  }, [ready, authenticated, router]);

  // Find or create a chat and redirect
  useEffect(() => {
    if (!authenticated || !agentId) return;
    if (isCreatingRef.current) return;

    async function findOrCreateChat() {
      isCreatingRef.current = true;

      try {
        // Try to get existing chats
        const { chats } = await listChats(agentId, { limit: 1 });

        if (chats.length > 0) {
          // Redirect to most recent chat
          router.replace(`/chats/${agentId}/${chats[0].id}`);
        } else {
          // Create a new chat
          const newChat = await createChat(agentId);
          router.replace(`/chats/${agentId}/${newChat.id}`);
        }
      } catch (err) {
        isCreatingRef.current = false;
        throw err;
      }
    }

    findOrCreateChat().catch((err) => {
      console.error("Failed to load/create chat:", err);
      setError(err instanceof Error ? err.message : "Failed to load chat");
    });
  }, [authenticated, agentId, router]);

  if (error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <p className="text-red-400">{error}</p>
        <button
          onClick={() => router.push("/chats")}
          className="text-sm text-white/60 hover:text-white"
        >
          Back to friends
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2">
      <Loader2 className="h-8 w-8 animate-spin text-brand" />
      <p className="text-sm text-white/60">Loading chat...</p>
    </div>
  );
}

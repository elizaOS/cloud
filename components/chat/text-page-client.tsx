"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Conversation, ConversationMessage } from "@/lib/types";
import { ConversationList } from "@/components/chat/conversation-list";
import { ChatInterfaceWithPersistence } from "@/components/chat/chat-interface-with-persistence";
import { useSetPageHeader } from "@/components/layout/page-header-context";
import { CornerBrackets } from "@/components/brand";

interface TextPageClientProps {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  initialMessages: ConversationMessage[];
}

export function TextPageClient({
  conversations: initialConversations,
  currentConversation: initialCurrentConversation,
  initialMessages,
}: TextPageClientProps) {
  const router = useRouter();
  const [conversations, setConversations] =
    useState<Conversation[]>(initialConversations);
  const [currentConversation, setCurrentConversation] =
    useState<Conversation | null>(initialCurrentConversation);

  useEffect(() => {
    setConversations(initialConversations);
  }, [initialConversations]);

  useEffect(() => {
    setCurrentConversation(initialCurrentConversation);
  }, [initialCurrentConversation]);

  useSetPageHeader({
    title: "Text & Chat",
    description:
      "Craft prompts, iterate with AI partners, and keep conversations organized in one focused workspace.",
  });

  const handleSelectConversation = (id: string) => {
    router.push(`/dashboard/text?conversationId=${id}`);
  };

  const handleConversationCreated = (conversation: Conversation) => {
    setConversations((prev) => [conversation, ...prev]);
    setCurrentConversation(conversation);
    router.push(`/dashboard/text?conversationId=${conversation.id}`);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-hidden">
      <div className="grid flex-1 min-h-0 gap-6 overflow-hidden md:grid-cols-[minmax(260px,320px)_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col">
          <div className="relative flex h-full min-h-0 overflow-hidden rounded-none border border-white/10 bg-black/40">
            <CornerBrackets size="sm" className="opacity-50" />
            <ConversationList
              conversations={conversations}
              currentConversationId={currentConversation?.id}
              onSelectConversation={handleSelectConversation}
            />
          </div>
        </aside>

        <section className="relative flex h-full min-h-0 w-full overflow-hidden rounded-none border border-white/10 bg-black/40">
          <CornerBrackets size="md" className="opacity-50" />
          <ChatInterfaceWithPersistence
            conversation={currentConversation}
            initialMessages={initialMessages}
            onConversationCreated={handleConversationCreated}
          />
        </section>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Conversation, ConversationMessage } from "@/lib/types";
import { ConversationList } from "@/components/chat/conversation-list";
import { ChatInterfaceWithPersistence } from "@/components/chat/chat-interface-with-persistence";
import { ElizaChatInterface } from "@/components/chat/eliza-chat-interface";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSetPageHeader } from "@/components/layout/page-header-context";

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
  const [chatMode, setChatMode] = useState<"ai-sdk" | "eliza">("ai-sdk");
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
      chatMode === "ai-sdk"
        ? "Craft prompts, iterate with AI partners, and keep conversations organized in one focused workspace."
        : "Chat with Eliza using the full ElizaOS runtime with persistent memory and room-based conversations.",
    actions: (
      <Tabs
        value={chatMode}
        onValueChange={(v) => setChatMode(v as "ai-sdk" | "eliza")}
      >
        <TabsList>
          <TabsTrigger value="ai-sdk">AI SDK</TabsTrigger>
          <TabsTrigger value="eliza">Eliza</TabsTrigger>
        </TabsList>
      </Tabs>
    ),
  }, [chatMode]);

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
      {chatMode === "ai-sdk" ? (
        <div className="grid flex-1 min-h-0 gap-6 overflow-hidden md:grid-cols-[minmax(260px,320px)_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col">
            <div className="flex h-full min-h-0 overflow-hidden rounded-2xl border bg-background/70 shadow-sm">
              <ConversationList
                conversations={conversations}
                currentConversationId={currentConversation?.id}
                onSelectConversation={handleSelectConversation}
              />
            </div>
          </aside>

          <section className="relative flex h-full min-h-0 w-full overflow-hidden rounded-2xl border bg-card shadow-sm">
            <ChatInterfaceWithPersistence
              conversation={currentConversation}
              initialMessages={initialMessages}
              onConversationCreated={handleConversationCreated}
            />
          </section>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 overflow-hidden rounded-2xl border bg-card shadow-sm">
          <ElizaChatInterface />
        </div>
      )}
    </div>
  );
}
